# 結マール５ 公式サイト・資金造成LP

2026-11-10：SNS・横断幕などへの氏名掲載について、未選択の必須2択と、掲載を希望する方の掲載名欄を追加。管理シートY列に掲載可否、Z列に掲載名を保存し、控えメールにも記載します。過去の空欄と旧フォームの「未取得」は掲載同意として扱いません。掲載名は公開集計APIでは返しません。

この版は既存Apps ScriptのCode.gsとReceipt.gsの更新も必要です。対応版をGETで確認できるまでは新しいフォームの送信を有効にしないため、旧APIへ同意内容だけが失われる送信を防ぎます。本番へのテスト申込は行わず、更新後はGETのみで確認します。

2026-11-04：新規受付番号を申込日＋日別連番（例：20261104-001）に変更。既存番号を維持し、完了画面・控えメール・管理シートで同じ番号を使用します。運用手順はinternal-docsブランチのapps-script/README.mdを参照。

一般社団法人ベースボール沖縄が運営するBASEBALL5チーム「結マール５」のサイトです。

## 公開中：日本選手権 遠征支援LP

公開URLは https://yuimaar5.com/fundraising.html です。入口は **fundraising.html** です。`fundraising-config.js`のapiUrlが空欄の間は確認用プレビューです。
Apps ScriptをデプロイしてURLを設定すると、申込保存・受付番号表示・公開集計が有効になります。
銀行振込自体は申込者が別途行い、運営が入金を確認します。申込保存後に受付控えメールを自動送信します。PayPay決済は未実装です。

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

http://127.0.0.1:8765/fundraising.html を開いてください。ビルドや追加ライブラリは不要です。

| ファイル | 役割 |
| --- | --- |
| fundraising.html | 資金造成LPの構成・原稿・フォーム |
| fundraising.css | 資金造成LP専用スタイル |
| fundraising.js | 金額選択・申込送信・保存確認後の振込案内・公開集計 |
| fundraising-config.js | 接続するApps Scriptの公開URL（空欄ならプレビュー） |
| apps-script/Code.gs | シートへの保存・入力検証・重複防止・公開集計API |
| apps-script/Receipt.gs | 受付控えメール・送信状態管理・運営による再送 |
| assets/fundraising-team-main.jpg | ユーザー指定のメイン写真 |

## 既存サイトと別案

- index.html：既存公式トップ。大会・体験会・学校活動などのページとassetsを含みます。
- support.html / support.css / support.js：初期の別案。資金造成版はfundraising.htmlです。
- styles.css / script.js：既存公式サイト用。

## GitHubでの作業

資金造成LPはfundraising.htmlを入口として、既存公式トップindex.htmlとファイルを分けて管理します。変更履歴は専用ブランチとPRに記録します。
銀行情報・連絡先はLP掲載用として提供された情報です。申込者データ、API秘密鍵、認証情報はコミットしないでください。
GitHub Pagesの公開設定・CNAMEは既存のものを保持しています。2026-11-03にユーザーの明示承認でPR #2をmainへ統合し、本番配信しました。

連携処理の内部テストは `node apps-script/test.cjs`。本番受付中の更新確認はGET（集計取得）のみに限定し、本番へのテスト申込（POST）は行いません。

2026-11-03：Apps Scriptバージョン3をデプロイして接続。ローカルLPからの申込保存・受付番号表示・重複防止・入金と返金の集計・同意と承認による本文公開を実機確認済み。チーム用アドレス宛ての控えメール送信処理成功とシートの「送信済」を確認。受信側への到着も今回のチーム用テストメールで確認済み。テスト申込は除去済み。

画面側の異常系テストは `node fundraising.test.cjs`、受付APIのテストは `node apps-script/test.cjs` と `node apps-script/rate-limit.test.cjs` で実行します。

2026-11-03 本番反映：PR #2をマージ（95f39ca）。GitHub Pagesの配信成功を確認し、公開URLから1,000円・琉球銀行のテスト申込、非公開シートへの保存、受付番号・振込先表示、控えメールの受信トレイ到着・内容一致まで確認。テスト行は除去済み。

## 内部資料の置き場所（2026-11-04）

mainのファイルは .nojekyll により yuimaar5.com でそのまま公開されるため、制作メモ・検証記録・運用手順（FUNDRAISING-CONTENT.md、FUNDRAISING-LP-PLAN.md、REFERENCE-LP-ANALYSIS.md、QA-2026-11-03.md、QA-2026-11-04.md、apps-script/README.md）はmainから外し、GitHub Pagesで配信しない `internal-docs` ブランチに保管しています。mainには公開してよいファイルだけを置いてください。ブランチを分けてもGitHubリポジトリ自体の閲覧権限は変わりません。

受付APIには連続送信対策として、同じメールアドレスは24時間で5件、全体は1時間30件・24時間100件までの上限があります（apps-script/Code.gs 冒頭の定数）。Code.gsを変更したら、Apps Scriptの「デプロイを管理 → 編集 → 新バージョン」で反映してください。
