package waitlist_test

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/willikay11/wrench/api/internal/core/domain"
	"github.com/willikay11/wrench/api/internal/core/services/waitlist"
)

type mockTxManager struct{}

func (m *mockTxManager) WithinTransaction(ctx context.Context, fn func(ctx context.Context) error) error {
	return fn(ctx)
}

type mockWaitlistRepository struct {
	savedWaitlist *domain.Waitlist
	saveErr       error
	count         int
	countErr      error
	// alreadyExists makes Save behave like an ON CONFLICT update — the row
	// was touched, not created, so no welcome email is owed.
	alreadyExists bool
}

type mockWaitlistRedis struct {
	savedCount int
	saveErr    error
	count      int
	countErr   error
}

type mockEmailQueue struct {
	enqueueEmailCalled            bool
	enqueueEmailTo                string
	enqueueEmailSubject           string
	enqueueEmailTemplateId        string
	enqueueEmailTemplateVariables map[string]any
	enqueueEmailErr               error
}

func (m *mockEmailQueue) EnqueueEmail(ctx context.Context, to string, subject string, templateId string, templateVariables map[string]any) error {
	m.enqueueEmailTemplateId = templateId
	m.enqueueEmailTemplateVariables = templateVariables
	m.enqueueEmailCalled = true
	m.enqueueEmailTo = to
	m.enqueueEmailSubject = subject
	return m.enqueueEmailErr
}

func (m *mockWaitlistRepository) Save(ctx context.Context, w *domain.Waitlist) error {
	if m.saveErr != nil {
		return m.saveErr
	}
	w.IsNew = !m.alreadyExists
	m.savedWaitlist = w
	return nil
}

func (m *mockWaitlistRepository) Count(ctx context.Context) (int, error) {
	if m.countErr != nil {
		return 0, m.countErr
	}
	return m.count, nil
}

func (m *mockWaitlistRedis) Count(ctx context.Context) (int, error) {
	if m.countErr != nil {
		return 0, m.countErr
	}
	return m.count, nil
}

func (m *mockWaitlistRedis) IncreaseCount(ctx context.Context, w int) error {
	if m.saveErr != nil {
		return m.saveErr
	}
	m.savedCount = w
	return nil
}

func TestJoinWaitlist(t *testing.T) {

	type testCase struct {
		name          string
		email         string
		expectedEmail string
		wantErr       error
	}

	t.Run("should save waitlist entry and return it", func(t *testing.T) {

		tests := []testCase{
			{name: "valid email", email: "willikay11@gmail.com", expectedEmail: "willikay11@gmail.com", wantErr: nil},
			{name: "invalid email", email: "not-an-email", expectedEmail: "", wantErr: domain.ErrInvalidEmail},
			{name: "email with spaces", email: " william@gmail.com ", expectedEmail: "william@gmail.com", wantErr: nil},
			{name: "empty email", email: "", expectedEmail: "", wantErr: domain.ErrInvalidEmail},
		}

		for _, tc := range tests {
			mockRepo := &mockWaitlistRepository{}
			mockRedis := &mockWaitlistRedis{}
			mockEmailQueue := &mockEmailQueue{}
			mockTxManager := &mockTxManager{}
			service := waitlist.NewService(mockRepo, mockRedis, mockEmailQueue, mockTxManager)

			got, err := service.JoinWaitlist(context.Background(), tc.email)

			if tc.wantErr != nil {
				assert.ErrorIs(t, err, tc.wantErr)
				assert.Nil(t, mockRepo.savedWaitlist) // must not touch the repo
				return
			}

			assert.NoError(t, err)
			assert.Equal(t, tc.expectedEmail, got.Email)
		}

	})
}

func TestCountWaitlist(t *testing.T) {
	type testCase struct {
		name          string
		expectedCount int
		wantErr       error
	}

	t.Run("should return a count of emails in the waitlist", func(t *testing.T) {
		tests := []testCase{
			{name: "at least 1 email in the waitlist", expectedCount: 1, wantErr: nil},
			{name: "no emails in the waitlist", expectedCount: 0, wantErr: nil},
			{name: "repository failure", expectedCount: 0, wantErr: errors.New("db down")},
		}

		for _, tc := range tests {
			mockRepo := &mockWaitlistRepository{
				count: tc.expectedCount,
			}
			mockRedis := &mockWaitlistRedis{
				count: tc.expectedCount,
			}

			mockEmailQueue := &mockEmailQueue{}
			mockTxManager := &mockTxManager{}
			service := waitlist.NewService(mockRepo, mockRedis, mockEmailQueue, mockTxManager)

			count, err := service.CountWaitlist(context.Background())

			assert.NoError(t, err)
			assert.Equal(t, tc.expectedCount, count)
		}

	})
}

func TestJoinWaitlistDoesNotResendOnRepeatSignup(t *testing.T) {
	t.Run("first signup queues the welcome email", func(t *testing.T) {
		mockRepo := &mockWaitlistRepository{}
		mockEmailQueue := &mockEmailQueue{}
		mockCache := &mockWaitlistRedis{}
		service := waitlist.NewService(mockRepo, mockCache, mockEmailQueue, &mockTxManager{})

		_, err := service.JoinWaitlist(context.Background(), "willikay11@gmail.com")

		assert.NoError(t, err)
		assert.True(t, mockEmailQueue.enqueueEmailCalled, "a new signup must be emailed")
		assert.Equal(t, "willikay11@gmail.com", mockEmailQueue.enqueueEmailTo)
		assert.Equal(t, domain.WelcomeEmailTemplateId, mockEmailQueue.enqueueEmailTemplateId)
	})

	t.Run("repeat signup queues nothing", func(t *testing.T) {
		// The row already exists, so Save updates it rather than inserting.
		mockRepo := &mockWaitlistRepository{alreadyExists: true}
		mockEmailQueue := &mockEmailQueue{}
		mockCache := &mockWaitlistRedis{}
		service := waitlist.NewService(mockRepo, mockCache, mockEmailQueue, &mockTxManager{})

		got, err := service.JoinWaitlist(context.Background(), "willikay11@gmail.com")

		assert.NoError(t, err, "a repeat signup is still a success for the caller")
		assert.Equal(t, "willikay11@gmail.com", got.Email)
		assert.False(t, mockEmailQueue.enqueueEmailCalled,
			"repeat signup must not queue a second welcome email: each enqueue "+
				"creates a new outbox row with a new idempotency key, which the "+
				"provider cannot deduplicate")
	})
}
