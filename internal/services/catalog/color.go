package catalog

import (
	"encoding/binary"
	"encoding/hex"
	"math/rand"

	"github.com/hsluv/hsluv-go"
)

// generateEntryColor produces a stable hex color code from an entry ID.
func generateEntryColor(ID string) string {
	seedBytes, err := hex.DecodeString(ID)
	if err != nil || len(seedBytes) < 8 {
		seedBytes = []byte(ID)
	}

	intHash := int64(binary.BigEndian.Uint64(seedBytes[:8]))
	rng := rand.New(rand.NewSource(intHash))
	h := rng.Float64() * 360.0
	s := 90.0
	l := 45.0

	return hsluv.HsluvToHex(h, s, l)
}
