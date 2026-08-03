package logs

import (
	"fmt"
	"slices"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
)

// runSeam feeds lines through the filter the way pumpStream does: skipped
// lines are dropped, emitted ones are observed.
func runSeam(f *seamFilter, lines []LogLine) []LogLine {
	emitted := make([]LogLine, 0, len(lines))
	for _, line := range lines {
		if f.skip(line) {
			continue
		}
		f.observe(line)
		emitted = append(emitted, line)
	}
	return emitted
}

func TestSeamFilter(t *testing.T) {
	sameSecond := make([]LogLine, 0, seamTailMax+1)
	for i := range seamTailMax + 1 {
		sameSecond = append(sameSecond, LogLine{T: 1000, Text: fmt.Sprintf("line-%d", i)})
	}

	tests := []struct {
		name     string
		observed []LogLine
		replay   []LogLine
		want     []LogLine
	}{
		{
			name:     "skips the replayed prefix",
			observed: []LogLine{{T: 1000, Text: "a"}, {T: 1500, Text: "b"}},
			replay:   []LogLine{{T: 1000, Text: "a"}, {T: 1500, Text: "b"}, {T: 1800, Text: "c"}},
			want:     []LogLine{{T: 1800, Text: "c"}},
		},
		{
			name:     "emits everything once the tail is consumed",
			observed: []LogLine{{T: 1000, Text: "a"}},
			replay:   []LogLine{{T: 1000, Text: "a"}, {T: 1200, Text: "b"}, {T: 2000, Text: "c"}},
			want:     []LogLine{{T: 1200, Text: "b"}, {T: 2000, Text: "c"}},
		},
		{
			name:     "a mismatch mid-prefix emits the rest, duplicates included",
			observed: []LogLine{{T: 1000, Text: "a"}, {T: 1100, Text: "b"}, {T: 1200, Text: "c"}},
			replay:   []LogLine{{T: 1000, Text: "a"}, {T: 1100, Text: "x"}, {T: 1100, Text: "b"}, {T: 1200, Text: "c"}},
			want:     []LogLine{{T: 1100, Text: "x"}, {T: 1100, Text: "b"}, {T: 1200, Text: "c"}},
		},
		{
			name:     "identical lines in one second are matched positionally",
			observed: []LogLine{{T: 1000, Text: "dup"}, {T: 1000, Text: "dup"}},
			replay:   []LogLine{{T: 1000, Text: "dup"}, {T: 1000, Text: "dup"}, {T: 1000, Text: "dup"}},
			want:     []LogLine{{T: 1000, Text: "dup"}},
		},
		{
			name:     "untimestamped lines ride the second in progress",
			observed: []LogLine{{T: 1000, Text: "a"}, {Text: "cont"}, {T: 1200, Text: "b"}},
			replay:   []LogLine{{T: 1000, Text: "a"}, {Text: "cont"}, {T: 1200, Text: "b"}, {T: 1300, Text: "d"}},
			want:     []LogLine{{T: 1300, Text: "d"}},
		},
		{
			name:     "a later second disables the filter",
			observed: []LogLine{{T: 1000, Text: "a"}},
			replay:   []LogLine{{T: 2000, Text: "z"}, {T: 2100, Text: "y"}},
			want:     []LogLine{{T: 2000, Text: "z"}, {T: 2100, Text: "y"}},
		},
		{
			name:     "only the last second is retained",
			observed: []LogLine{{T: 1000, Text: "a"}, {T: 2000, Text: "b"}},
			replay:   []LogLine{{T: 2000, Text: "b"}, {T: 2100, Text: "c"}},
			want:     []LogLine{{T: 2100, Text: "c"}},
		},
		{
			name:   "nothing to skip on the first open",
			replay: []LogLine{{T: 1000, Text: "a"}},
			want:   []LogLine{{T: 1000, Text: "a"}},
		},
		{
			name:     "an overflowed tail accepts duplicates",
			observed: sameSecond,
			replay:   []LogLine{sameSecond[0], {T: 1000, Text: "next"}},
			want:     []LogLine{sameSecond[0], {T: 1000, Text: "next"}},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var f seamFilter
			runSeam(&f, tt.observed)
			f.arm()

			if got := runSeam(&f, tt.replay); !slices.Equal(got, tt.want) {
				t.Errorf("emitted %v, want %v", got, tt.want)
			}
		})
	}
}

func TestSinceTime(t *testing.T) {
	// Truncated down: the reopen replays the boundary second rather than
	// risking a gap.
	got := sinceTime(1712345678901).Time
	if want := time.Unix(1712345678, 0); !got.Equal(want) {
		t.Errorf("sinceTime = %v, want %v", got, want)
	}
}

func TestRetryBackoff(t *testing.T) {
	want := []time.Duration{time.Second, 2 * time.Second, 4 * time.Second, 8 * time.Second, 16 * time.Second, 16 * time.Second}
	for i, w := range want {
		if got := retryBackoff(i + 1); got != w {
			t.Errorf("retryBackoff(%d) = %v, want %v", i+1, got, w)
		}
	}
}

func TestNoteRestart(t *testing.T) {
	terminated := func(code int32) corev1.ContainerState {
		return corev1.ContainerState{Terminated: &corev1.ContainerStateTerminated{ExitCode: code}}
	}

	tests := []struct {
		name          string
		seeded        int32
		status        *corev1.ContainerStatus
		wantRestarted bool
		wantExit      *int32
		wantSeeded    int32
	}{
		{
			name:       "unseeded count only seeds",
			seeded:     restartUnseeded,
			status:     &corev1.ContainerStatus{RestartCount: 3},
			wantSeeded: 3,
		},
		{
			name:          "a bump reports the last exit code",
			seeded:        2,
			status:        &corev1.ContainerStatus{RestartCount: 3, LastTerminationState: terminated(137)},
			wantRestarted: true,
			wantExit:      ptr(int32(137)),
			wantSeeded:    3,
		},
		{
			name:          "a bump without a termination state has no exit code",
			seeded:        3,
			status:        &corev1.ContainerStatus{RestartCount: 4},
			wantRestarted: true,
			wantSeeded:    4,
		},
		{
			name:       "an unchanged count is not a restart",
			seeded:     3,
			status:     &corev1.ContainerStatus{RestartCount: 3},
			wantSeeded: 3,
		},
		{
			name:       "a missing status leaves the count alone",
			seeded:     3,
			wantSeeded: 3,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := &reopenState{restartCount: tt.seeded}

			restarted, exit := st.noteRestart(tt.status)
			if restarted != tt.wantRestarted {
				t.Errorf("restarted = %v, want %v", restarted, tt.wantRestarted)
			}
			switch {
			case tt.wantExit == nil && exit != nil:
				t.Errorf("exit code = %d, want none", *exit)
			case tt.wantExit != nil && (exit == nil || *exit != *tt.wantExit):
				t.Errorf("exit code = %v, want %d", exit, *tt.wantExit)
			}
			if st.restartCount != tt.wantSeeded {
				t.Errorf("restartCount = %d, want %d", st.restartCount, tt.wantSeeded)
			}
		})
	}
}

func TestCanRestart(t *testing.T) {
	always := corev1.ContainerRestartPolicyAlways

	tests := []struct {
		name    string
		policy  corev1.RestartPolicy
		exit    int32
		init    bool
		sidecar bool
		want    bool
	}{
		{name: "never", policy: corev1.RestartPolicyNever, exit: 1},
		{name: "always", policy: corev1.RestartPolicyAlways, exit: 0, want: true},
		{name: "always, completed init container", policy: corev1.RestartPolicyAlways, init: true},
		{name: "always, failed init container", policy: corev1.RestartPolicyAlways, exit: 1, init: true, want: true},
		{name: "on failure, clean exit", policy: corev1.RestartPolicyOnFailure},
		{name: "on failure, error exit", policy: corev1.RestartPolicyOnFailure, exit: 1, want: true},
		{name: "native sidecar, clean exit", policy: corev1.RestartPolicyNever, init: true, sidecar: true, want: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pod := &corev1.Pod{Spec: corev1.PodSpec{RestartPolicy: tt.policy}}
			if tt.init {
				c := corev1.Container{Name: "c"}
				if tt.sidecar {
					c.RestartPolicy = &always
				}
				pod.Spec.InitContainers = []corev1.Container{c}
			}
			term := &corev1.ContainerStateTerminated{ExitCode: tt.exit}

			if got := canRestart(pod, "c", term, tt.init); got != tt.want {
				t.Errorf("canRestart = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestContainerStatus(t *testing.T) {
	pod := &corev1.Pod{Status: corev1.PodStatus{
		ContainerStatuses: []corev1.ContainerStatus{
			{Name: "app", RestartCount: 1},
			{Name: "sidecar", RestartCount: 2},
		},
		InitContainerStatuses: []corev1.ContainerStatus{{Name: "setup", RestartCount: 3}},
	}}

	tests := []struct {
		name      string
		container string
		want      string
		wantInit  bool
	}{
		{name: "empty name takes the first container", want: "app"},
		{name: "by name", container: "sidecar", want: "sidecar"},
		{name: "init container", container: "setup", want: "setup", wantInit: true},
		{name: "unknown name", container: "nope"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cs, init := containerStatus(pod, tt.container)
			switch {
			case tt.want == "" && cs != nil:
				t.Errorf("got status %q, want none", cs.Name)
			case tt.want != "" && (cs == nil || cs.Name != tt.want):
				t.Errorf("got status %v, want %q", cs, tt.want)
			}
			if init != tt.wantInit {
				t.Errorf("init = %v, want %v", init, tt.wantInit)
			}
		})
	}

	if cs, _ := containerStatus(&corev1.Pod{}, ""); cs != nil {
		t.Errorf("got status %q for a pod with no statuses, want none", cs.Name)
	}
}

func ptr[T any](v T) *T { return &v }
