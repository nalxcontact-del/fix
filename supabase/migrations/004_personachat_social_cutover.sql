-- PersonaChat v83: social/community/feedback/report cutover additions.
ALTER TABLE response_feedback ADD COLUMN IF NOT EXISTS tags_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE response_feedback ADD COLUMN IF NOT EXISTS note TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_bot_likes_user_created ON bot_likes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_likes_bot_created ON bot_likes(bot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profile_likes_user_created ON profile_likes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profile_likes_profile_created ON profile_likes(profile_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_follows_follower_created ON follows(follower_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_follows_following_created ON follows(following_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_response_feedback_user_created ON response_feedback(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_feedback_user_created ON product_feedback(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_reporter_created ON reports(reporter_id, created_at DESC);
