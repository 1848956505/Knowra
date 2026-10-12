-- 稳定身份迁移 S2b-2：重点绑定（以块身份表 ID 描述位置），可空，旧数据无需回填。
ALTER TABLE "ContentAnnotation" ADD COLUMN IF NOT EXISTS "identityBinding" JSONB;
