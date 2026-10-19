# 月次模擬試験・ランキング運用手順

状態: 専用テストDBへ別承認のもとscheduler SQLを適用し、権限とSQL→Node署名を検証済み。Cronは未登録、秘密/送信キューのfixtureはrollback済み。本文は本番操作の承認ではない。本番DB反映、実秘密登録、デプロイ、Cron開始、pushは各段階で確認する。実HTTPの予約実行は未検証。

## 1. 接続先と事前保護

| 環境 | Supabase project ref | 設定元 |
| --- | --- | --- |
| 専用テスト | grzylombpqmidltnbwhx | .env.test.localのみ。通常envの全KAKOMON_MOCK_設定は子プロセスから除去 |
| 本番 | ckgoikdjhtklhbzdgxxs | 本番Vercelサーバー環境。テスト秘密やTEST_値を使わない |

NEXT_PUBLIC_SUPABASE_URL、DATABASE_URL、DIRECT_URL、KAKOMON_MOCK_PROJECT_REFを同じrefへそろえる。URLのhost/user/port/query等の上書きを含む接続先を拒否する専用テストguardを使う。値・秘密・DB接続文字列をログ/チャットへ出さず、refだけ照合する。テストの失敗時に本番へfallbackしない。

本番を操作する直前に既存のバックアップ手順でroles/schema/dataを保存し、日時・対象ref・保存先・ファイルサイズ/ハッシュを記録する。Storage画像本体はDB dumpだけでは保護できないため別途保持。復元先で既存業務データを上書きしない。Vaultはプロジェクト固有の暗号化に依存するため、別プロジェクトへの手動dump復元だけで秘密も使えるとは扱わない。

SQL適用前に既存migration履歴、対象テーブル、RLS、拡張とVault権限を読取確認する。既存データを消して合わせない。未適用の追加SQLを1つずつ承認して適用し、実行結果と履歴を照合する。履歴が一致しなければ中断し、過去のSQLを書き換えない。

この機能の順序は次のとおり（schedulerの番号より業務依存関係を優先）:

1. 20261016000000_monthly_mock_exams.sql
2. 20261017000000_mock_attempt_start_requests.sql
3. 20261016010000_mock_exam_scheduler.sql（独立した準備。Cron未登録）
4. 20261019000000_mock_scheduler_secret_length.sql（関数内の秘密長チェックの修正）

PostgreSQLの正規表現量指定は255までのため、32〜256文字の検証を文字数と文字種へ分離する追加SQLも必須。すでに適用したscheduler SQL/履歴は書き換えず、関数の想定箇所が1か所だけ一致するときに修正する。[PostgreSQL公式仕様](https://www.postgresql.org/docs/current/functions-matching.html)を参照。

本番CLIでmigrationを一括pushせず、リポジトリ全体の未適用分も確認する。scheduler SQLはpg_cron・pg_net・pgcryptoと非公開schema/functionだけを作る。秘密値やHTTP呼出し、Cron登録は含まない。既存Vaultが学生から読める場合はfail-closedで中断し、他機能の権限を自動変更しない。Prismaアプリ接続とschedulerの管理接続を混同しない。

## 2. 3つの停止スイッチ

| サーバー環境変数 | falseの効果 |
| --- | --- |
| KAKOMON_MOCK_ENABLED | 機能全体停止。通常機能は維持し、追加テーブルの参照を回避 |
| KAKOMON_MOCK_STARTS_ENABLED | 新規受験だけ停止。受理済みIDの再開・保存・提出・期限切れ整合は維持 |
| KAKOMON_MOCK_JOBS_ENABLED | 署名認証/nonce消費後の自動業務を停止。通常ログインでは実行不可 |

初期配置は3つともfalse、Cron未登録。値を変更したらサーバーを再起動/再デプロイし、実際の配備先を確認する。最初はmasterだけtrueにして読み取り/接続先/署名を確認し、出題準備を済ませてから新規開始と自動処理を段階的に有効化する。jobsだけtrueでもmasterがfalseなら業務は動かない。Cron側も止めることで無用なHTTP呼出しを停止する。

## 3. 秘密と固定呼出し設定

新規の専用ランダム秘密を環境ごとに別生成する。32〜256文字の英数字・_・-を使い、例としてnode:cryptoのrandomBytes(32).toString('base64url')が使える。実行結果を共有ログへ出さない。Supabase API keyやDB passwordを流用しない。ブラウザーへ公開するNEXT_PUBLIC_変数には入れない。

| Supabase Vault名 | サーバー側との対応 |
| --- | --- |
| mock_exam_job_secret | KAKOMON_MOCK_JOB_SECRETと同じ専用秘密 |
| mock_exam_project_ref | KAKOMON_MOCK_PROJECT_REF |
| mock_exam_environment | KAKOMON_MOCK_ENVIRONMENT=testまたはproduction（refとの組合せ固定） |
| mock_exam_tick_url | 承認したHTTPS配備先 + /api/internal/mock-exams/tick。query/fragment/port/任意payloadなし |

秘密登録はSupabase Vault UIで行い、SQL履歴へ平文を残さない。必要な場合だけ管理接続からパラメーター化したvault.create_secret/update_secretを使い、取得値を出力しない。URLも環境別に確認し、Previewのproductionデータ接続を禁止する。SupabaseクラウドからPCの127.0.0.1へは到達できないため、HTTP検証には別承認済みの到達可能なテスト配備先が必要。

引数なしのmock_exam_private.dispatch_tick()だけが固定URL/パス/本文を署名する。search_path=pg_catalog、完全修飾参照、postgres所有、PUBLIC/anon/authenticatedにschema/function権限なし。任意URL/本文を渡す関数や公開RPCは作らない。Vaultは平文viewを保護し、関数定義に実秘密を含めない。

HMAC-SHA256のcanonicalはPOST、固定path、ref、環境、Unix秒、UUID nonce、送信本文SHA256の7項目をLFで結合する。pg_netのJSONB::textは空白付き`{"action": "tick"}`となるため、その生バイトで署名する。Node側はその固定形式とcompact形式だけを受け付け、署名時に本文を正規化しない。受信時刻±60秒を外れたキュー要求は401、同nonceは409。HTTPヘッダーに入るのは短期署名と公開メタデータだけで、永続秘密は入らない。キュー/応答全体を公開ログへコピーしない。

rotation時はCronとjobsを停止→Vaultの専用秘密を更新→同じ環境のVercel秘密を更新/再デプロイ→新署名の認証と旧署名拒否を確認→再開する。旧キューは有効期限切れになる。業務key・配布ledgerは保持するので新nonceでの再試行は重複配布しない。漏洩時は新規開始も必要に応じて停止し、平文秘密を含むログを安全に扱う。

## 4. 別承認後だけCronを登録

ここから先は自動では実行しない。接続先、バックアップ、追加SQL、実HTTP、出題/画像、停止手順を確認した後に承認を得る。postgres管理接続で、同名jobがないことを先に確認する。

```sql
select jobid,jobname,schedule,active from cron.job
where jobname='kakomonkun-monthly-mock-tick';
```

既存があれば追加登録せず内容を照合する。新規登録は次の1件だけ。戻り値のjobidを環境別運用記録へ保存する。

```sql
select cron.schedule(
  'kakomonkun-monthly-mock-tick',
  '* * * * *',
  'select mock_exam_private.dispatch_tick();'
);
```

一時停止は記録したjobidとjobnameの一致を読取確認し、`cron.alter_job(<確認したjobid>, active := false)`。再開は同じjobidをtrueにする。廃止は同じ照合後に`cron.unschedule(<確認したjobid>)`。他jobへの一括操作は禁止する。手動dispatchもHTTPを送るため、初回は別承認されたテスト配備先だけで行う。

## 5. HTTPと業務進捗を分けて監視

cron.job_run_detailsのsucceededはSQLがキューへ依頼できたことだけで、採点/配布完了ではない。pg_netの返却request idとnet._http_responseのstatus_code/timed_out/error_msgを管理者だけが短時間確認する。レスポンス本文は件数/成否のみで、学生情報・正解・内部エラーを含めない。pg_netの応答保管期間を長期業務監査の代わりにしない。

| 状態 | 対応 |
| --- | --- |
| 401/409 | 時刻、キュー遅延、環境/URL/秘密対応を確認。古い署名を再送せず、新nonceの次tickを使う |
| 503 | 停止スイッチや接続先設定を確認。エラー中に本番接続へ切り替えない |
| HTTP200 / failed>0 | 業務失敗。jobのlastErrorCode/nextRunAt/attemptsを確認。1/5/15/60分backoffを待つ |
| HTTP200 / remaining=true | 未完了。pending/running/failed件数が減るか、120秒lease後に再開されるか確認 |
| 25日以降 | in_progress採点残件→rankingFinalizedAt→未処理reward行→rewardsCompletedAtを別々に確認 |

業務jobのlastErrorCodeは固定の安全なcodeだけ。30日超で詳細を消去するが、jobKey・completedAt、受験/順位/ポイント/通知の業務記録は消さない。dispatch nonceは再送可能時間を十分過ぎた3分超だけ整理する。

cleanup_run_details()は登録した同名job、postgres、現在DB、正規の固定commandがすべて一致するjobidの完了済み実行履歴だけを7日超で削除する。dispatch内から呼び、他jobと業務データには触れない。jobを廃止した後の履歴は自動照合できないため、保存したjobidで対象を確認して別承認で整理する。

1分ごとの依頼数は28日40,320回・30日43,200回・31日44,640回。29日は41,760回。これは予定HTTP数で、無料で必ず収まる保証ではない。SupabaseのDB/ネットワーク/停止状態、Vercelのfunction呼出し・duration/CPU/転送量を当該プランのDashboardで確認する。日次の失敗増加や残件停滞を監視し、無料プロジェクトの停止や遅延でも学生の締切/受験時間は延長しない。

## 6. 保持するロールバック

異常時は新規開始とjobs/Cronを止め、受理済み受験があるなら保存/提出を扱えるmaster設定を検討する。必要ならmasterも停止しコードを戻す。追加schema/tableや固定問題画像をdropしない。確定順位・配布済みポイント・永久称号資格・通知を自動で巻き戻さず、個別調整は別途確認する。バックアップ復元は運用後の正常データも失う可能性があるため、コードrollbackと同義にはしない。

## 7. 検証の実施範囲

単体のpg_net固定本文互換性に加え、専用DBでのscheduler権限、SQL→Node HMAC一致、キュー内の秘密非露出、61秒遅延の拒否を確認済み。anon/authenticatedの実ロールへ切り替えた呼出しも42501で拒否。秘密32/256文字を受理し、31/257文字・禁止文字、環境不一致、不正URL、設定未登録を拒否する。テストは一時Vault設定とキュー行を同一トランザクションでrollbackし、残件0とCron0件を確認した。実HTTPは送っていない。Cron登録/実HTTP予約実行/本番導入は未実施。この状態を「全体運用確認済み」とは報告しない。

公式参照（2026-10-19確認）: [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net)、[pg_net実装](https://github.com/supabase/pg_net/blob/master/sql/pg_net.sql)、[Cron](https://supabase.com/docs/guides/cron)、[Vault](https://supabase.com/docs/guides/database/vault)。料金・上限は導入時に再確認する。
