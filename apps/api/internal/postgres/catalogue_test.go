package postgres

import (
	"testing"

	"github.com/stretchr/testify/require"
)

// Search text is matched as text. Each character LIKE treats specially must
// arrive escaped, and a backslash the client sent must not be able to escape
// the escape that follows it.
func TestEscapeLikeMakesPatternCharactersLiteral(t *testing.T) {
	cases := map[string]string{
		"nissan":  "nissan",
		"100%":    `100\%`,
		"a_b":     `a\_b`,
		`back\`:   `back\\`,
		`\%`:      `\\\%`,
		"%_%":     `\%\_\%`,
		"":        "",
		"GT-R 86": "GT-R 86",
	}

	for input, want := range cases {
		require.Equal(t, want, escapeLike(input), "input %q", input)
	}
}
