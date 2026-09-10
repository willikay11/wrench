package domain

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
)

// Paging limits. The default and the ceiling come from the API spec; the
// ceiling exists so one request cannot ask for an unbounded scan.
const (
	DefaultCarPageSize = 20
	MaxCarPageSize     = 50
)

var (
	ErrInvalidCursor = errors.New("invalid cursor")
	ErrInvalidLimit  = errors.New("invalid limit")
)

// CarCursor marks the last row of a page. It carries createdAt *and* id because
// the list is ordered by createdAt descending and createdAt is not unique — two
// cars added in the same transaction share it. A cursor on createdAt alone
// would either skip the rows sharing that instant or repeat them.
type CarCursor struct {
	CreatedAt time.Time `json:"createdAt"`
	Id        uuid.UUID `json:"id"`
}

// Encode renders the cursor as the opaque string a client sends back. Opaque by
// intent: base64 of JSON is readable by anyone who cares to look, so the cursor
// must never be trusted for anything but position — the owner comes from the
// token on every request, never from here.
func (c CarCursor) Encode() string {
	// A struct of a time and a uuid cannot fail to marshal.
	encoded, _ := json.Marshal(c)
	return base64.RawURLEncoding.EncodeToString(encoded)
}

// DecodeCarCursor parses what a client sent back. Anything unreadable is an
// error rather than a silent reset to the first page: a client that keeps
// receiving page one for a cursor it believes in would loop forever.
func DecodeCarCursor(encoded string) (CarCursor, error) {
	raw, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return CarCursor{}, ErrInvalidCursor
	}

	var cursor CarCursor
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&cursor); err != nil {
		return CarCursor{}, ErrInvalidCursor
	}

	// A zero id would compare equal to nothing and silently widen the page
	// boundary, so a cursor missing either half is not a cursor.
	if cursor.Id == uuid.Nil || cursor.CreatedAt.IsZero() {
		return CarCursor{}, ErrInvalidCursor
	}

	return cursor, nil
}

// CarPage is one page of a user's garage, plus what a client needs to ask for
// the next one.
type CarPage struct {
	Cars       []Car
	NextCursor *CarCursor
	HasMore    bool
	Total      int
}

// CarQuery is a validated request for one page. Constructing it through
// NewCarQuery is what guarantees the limit is inside the allowed range, so the
// repository never has to re-check it.
type CarQuery struct {
	UserId uuid.UUID
	Limit  int
	Cursor *CarCursor
}

// NewCarQuery validates the paging parameters as the API spec defines them: an
// absent limit takes the default, and one outside 1–50 is refused rather than
// clamped — silently returning a different page size than asked for hides a
// client bug.
func NewCarQuery(userID uuid.UUID, limit *int, cursor *CarCursor) (CarQuery, error) {
	size := DefaultCarPageSize
	if limit != nil {
		if *limit < 1 || *limit > MaxCarPageSize {
			return CarQuery{}, ErrInvalidLimit
		}
		size = *limit
	}

	return CarQuery{UserId: userID, Limit: size, Cursor: cursor}, nil
}
