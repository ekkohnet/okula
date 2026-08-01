package catalog

import (
	"crypto/md5"
	"fmt"
)

// generateEntryID deterministically hashes a path + context name into a stable ID.
func generateEntryID(path string, ctxName string) string {
	return fmt.Sprintf("%x", md5.Sum([]byte(path+":"+ctxName)))
}
