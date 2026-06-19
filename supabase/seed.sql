INSERT INTO roles (name, description, updated_at) VALUES
('student', '学生', now()), ('teacher', '教師・管理者相当', now())
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description, updated_at = now();

INSERT INTO exams (code, name, description, updated_at) VALUES
('it_passport', 'ITパスポート', 'ITパスポート試験', now()),
('fe', '基本情報技術者', '基本情報技術者試験', now())
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, updated_at = now();

INSERT INTO question_categories (code, name, sort_order, updated_at) VALUES
('technology', 'テクノロジ系', 1, now()),
('management', 'マネジメント系', 2, now()),
('strategy', 'ストラテジ系', 3, now())
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order, updated_at = now();

INSERT INTO users (role_id, email, display_name, status, updated_at)
SELECT id, 'student@example.com', 'デモ学生', 'active', now() FROM roles WHERE name = 'student'
ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, status = 'active', updated_at = now();

INSERT INTO student_profiles (user_id, updated_at)
SELECT id, now() FROM users WHERE email = 'student@example.com'
ON CONFLICT (user_id) DO UPDATE SET updated_at = now();

WITH payload AS (SELECT '[{"sourceKey":"it-passport-supplemental-1","examCode":"it_passport","categoryCode":"technology","sourceYear":null,"sourceSeason":"補助問題","questionNo":1,"questionText":"OSI基本参照モデルのトランスポート層で動作するプロトコルはどれか？","imagePath":null,"explanation":"TCP（Transmission Control Protocol）は、OSIモデルのトランスポート層で信頼性のあるデータ転送を提供します。IPはネットワーク層、HTTPはアプリケーション層、Ethernetはデータリンク層で動作します。","choices":[{"label":"A","text":"IP","isCorrect":false,"sortOrder":1},{"label":"B","text":"HTTP","isCorrect":false,"sortOrder":2},{"label":"C","text":"TCP","isCorrect":true,"sortOrder":3},{"label":"D","text":"Ethernet","isCorrect":false,"sortOrder":4}]},{"sourceKey":"it-passport-supplemental-2","examCode":"it_passport","categoryCode":"management","sourceYear":null,"sourceSeason":"補助問題","questionNo":2,"questionText":"プロジェクトマネジメントにおいて、プロジェクトのスコープ、時間、コストの制約を何と呼ぶか？","imagePath":null,"explanation":"鉄の三角形（またはプロジェクトマネジメントの三角形）は、スコープ、時間、コストの3つの主要な制約を表します。これらは相互に関連しており、1つを変更すると他の少なくとも1つに影響を与えます。","choices":[{"label":"A","text":"品質トライアングル","isCorrect":false,"sortOrder":1},{"label":"B","text":"リスクマトリクス","isCorrect":false,"sortOrder":2},{"label":"C","text":"プロジェクト憲章","isCorrect":false,"sortOrder":3},{"label":"D","text":"鉄の三角形","isCorrect":true,"sortOrder":4}]},{"sourceKey":"it-passport-supplemental-3","examCode":"it_passport","categoryCode":"strategy","sourceYear":null,"sourceSeason":"補助問題","questionNo":3,"questionText":"企業の外部環境と内部環境を分析し、強み、弱み、機会、脅威を評価するフレームワークは何か？","imagePath":null,"explanation":"SWOT分析は、企業の戦略計画を策定するために、内部要因（Strengths, Weaknesses）と外部要因（Opportunities, Threats）を評価するのに役立ちます。","choices":[{"label":"A","text":"SWOT分析","isCorrect":true,"sortOrder":1},{"label":"B","text":"PEST分析","isCorrect":false,"sortOrder":2},{"label":"C","text":"ファイブフォース分析","isCorrect":false,"sortOrder":3},{"label":"D","text":"バリューチェーン分析","isCorrect":false,"sortOrder":4}]},{"sourceKey":"fe-subject-a-2025-1","examCode":"fe","categoryCode":"technology","sourceYear":2025,"sourceSeason":"基本情報技術者試験科目 A 公開問題 (令和7年度)","questionNo":1,"questionText":"大規模言語モデルを用いた自然言語処理において、事前学習済みのモデルに対して行うファインチューニングに関する記述として、最も適切なものはどれか。","imagePath":null,"explanation":null,"choices":[{"label":"ア","text":"強化学習を行い、最適な結果が得られるようにする。","isCorrect":false,"sortOrder":1},{"label":"イ","text":"事前学習と同じデータを繰り返し用いて学習を行い、モデルの精度を高めるようにする。","isCorrect":false,"sortOrder":2},{"label":"ウ","text":"大量のテキストデータを用いて学習を行い、モデルの精度を高めるようにする。","isCorrect":false,"sortOrder":3},{"label":"エ","text":"特定のデータを用いて追加で学習を行い、目的とするタスクに適用できるようにする。","isCorrect":true,"sortOrder":4}]},{"sourceKey":"fe-subject-a-2025-2","examCode":"fe","categoryCode":"technology","sourceYear":2025,"sourceSeason":"基本情報技術者試験科目 A 公開問題 (令和7年度)","questionNo":2,"questionText":"浮動小数点形式で表現された数値の演算結果における丸め誤差の説明はどれか。","imagePath":null,"explanation":null,"choices":[{"label":"ア","text":"演算結果がコンピュータの扱える最大値を超えることによって生じる誤差である。","isCorrect":false,"sortOrder":1},{"label":"イ","text":"数表現のけた数に限度があるので、最下位けたより小さい部分について四捨五入や切上げ、切捨てを行うことによって生じる誤差である。","isCorrect":true,"sortOrder":2},{"label":"ウ","text":"乗除算において、指数部が小さい方の数値の仮数部の下位部分が失われることによって生じる誤差である。","isCorrect":false,"sortOrder":3},{"label":"エ","text":"絶対値がほぼ等しい数値の加減算において、上位の有効数字が失われることによって生じる誤差である。","isCorrect":false,"sortOrder":4}]},{"sourceKey":"fe-subject-a-2025-3","examCode":"fe","categoryCode":"technology","sourceYear":2025,"sourceSeason":"基本情報技術者試験科目 A 公開問題 (令和7年度)","questionNo":3,"questionText":"図の木構造は2分探索木である。a~g の値の大小関係として、適切なものはどれか。ここで、a~gの値は重複しないものとする。","imagePath":"/kakomon/img/2025A/3.png","explanation":null,"choices":[{"label":"ア","text":"a<b<d<e<c<f<g","isCorrect":false,"sortOrder":1},{"label":"イ","text":"d<b<e<a<f<c<g","isCorrect":true,"sortOrder":2},{"label":"ウ","text":"d<e<f<g<b<c<a","isCorrect":false,"sortOrder":3},{"label":"エ","text":"g<f<c<e<d<b<a","isCorrect":false,"sortOrder":4}]}]'::jsonb AS data),
question_rows AS (
  SELECT q.* FROM payload, jsonb_to_recordset(data) AS q(
    "sourceKey" text, "examCode" text, "categoryCode" text, "sourceYear" integer,
    "sourceSeason" text, "questionNo" integer, "questionText" text,
    "imagePath" text, explanation text, choices jsonb
  )
), inserted_questions AS (
  INSERT INTO questions (
    source_key, exam_id, category_id, source_year, source_season, question_no,
    question_text, image_path, explanation, status, updated_at
  )
  SELECT q."sourceKey", e.id, c.id, q."sourceYear", q."sourceSeason", q."questionNo",
         q."questionText", q."imagePath", q.explanation, 'published', now()
  FROM question_rows q
  JOIN exams e ON e.code = q."examCode"
  JOIN question_categories c ON c.code = q."categoryCode"
  ON CONFLICT (source_key) DO UPDATE SET
    exam_id = EXCLUDED.exam_id, category_id = EXCLUDED.category_id,
    source_year = EXCLUDED.source_year, source_season = EXCLUDED.source_season,
    question_no = EXCLUDED.question_no, question_text = EXCLUDED.question_text,
    image_path = EXCLUDED.image_path, explanation = EXCLUDED.explanation,
    status = 'published', updated_at = now()
  RETURNING id, source_key
)
INSERT INTO question_choices (
  question_id, choice_label, choice_text, is_correct, sort_order, updated_at
)
SELECT iq.id, choice.label, choice.text, choice."isCorrect", choice."sortOrder", now()
FROM question_rows q
JOIN inserted_questions iq ON iq.source_key = q."sourceKey"
CROSS JOIN LATERAL jsonb_to_recordset(q.choices) AS choice(
  label text, text text, "isCorrect" boolean, "sortOrder" integer
)
ON CONFLICT (question_id, choice_label) DO UPDATE SET
  choice_text = EXCLUDED.choice_text,
  is_correct = EXCLUDED.is_correct,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
