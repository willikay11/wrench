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
