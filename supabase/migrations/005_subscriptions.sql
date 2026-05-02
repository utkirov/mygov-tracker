-- 005_subscriptions.sql
-- Subscription tiers table with RLS and auto-trigger for new users

CREATE TABLE subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  plan_id     text NOT NULL DEFAULT 'free' CHECK (plan_id IN ('free', 'standard', 'pro')),
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
  started_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Auto-create free subscription for new users
CREATE OR REPLACE FUNCTION create_free_subscription()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO subscriptions(user_id, plan_id)
  VALUES (NEW.id, 'free')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_free_subscription();

-- Create free subscriptions for existing users
INSERT INTO subscriptions(user_id, plan_id)
SELECT id, 'free' FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
