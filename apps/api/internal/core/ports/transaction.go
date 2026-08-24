package ports

import "context"

// TxManager is shared by every feature, so it lives on its own rather than
// with any one of them. The transaction itself rides in the context, which is
// what keeps the database driver out of core.
type TxManager interface {
	WithinTransaction(ctx context.Context, fn func(ctx context.Context) error) error
}
