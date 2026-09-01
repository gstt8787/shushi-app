'use strict';
/*
 * config.js — 本番接続の設定
 *
 * USE_SUPABASE: true=Supabase保存（本番） / false=端末内保存（モック・デモ）
 * SUPABASE_KEY は publishable key（公開可能キー）。
 * 「このキーは公開されても安全」という設計のキーで、守りの本体は
 * 行単位権限（RLS・db/policies_v1.sql）にある。secret keyは絶対にここへ書かない。
 */
var APP_CONFIG = {
  USE_SUPABASE: true,
  SUPABASE_URL: 'https://cxbbehbmpcsnwyooaibx.supabase.co',
  SUPABASE_KEY: 'sb_publishable_SORziV6A22zA4xmjQaJerQ_ar4apA7B'
};
