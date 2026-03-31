-- Query 2: As user A (should only see the E30)
SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "0468c4d8-e74a-46a1-9e3f-aed66306bb93"}';
SELECT id, user_id, title FROM public.builds;