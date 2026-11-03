# 結マール５ 公式サイト・資金造成LP

一般社団法人ベースボール沖縄が運営するBASEBALL5チーム「結マール５」のサイトです。

## レビュー中：日本選手権 遠征支援LP

入口は **fundraising.html** です。`fundraising-config.js`のapiUrlが空欄の間は確認用プレビューです。
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
| apps-script/README.md | デプロイと確認手順・運用方法 |
| assets/fundraising-team-main.jpg | ユーザー指定のメイン写真 |
| FUNDRAISING-CONTENT.md | 確定原稿・仕様の記録（後半の更新を優先） |
| FUNDRAISING-LP-PLAN.md | 制作手順・進捗 |
| REFERENCE-LP-ANALYSIS.md | 参考LPの構成と連携方式の分析 |

## 既存サイトと別案

- index.html：既存公式トップ。大会・体験会・学校活動などのページとassetsを含みます。
- support.html / support.css / support.js：初期の別案。資金造成版はfundraising.htmlです。
- styles.css / script.js：既存公式サイト用。

## GitHubでの作業

資金造成LPは専用ブランチで管理し、レビュー後にmainへのマージを検討します。
銀行情報・連絡先はLP掲載用として提供された情報です。申込者データ、API秘密鍵、認証情報はコミットしないでください。
GitHub Pagesの公開設定・CNAMEは既存のものを保持しています。この作業では本番反映を行いません。

連携処理の内部テストは `node apps-script/test.cjs`。別途、実際のデプロイ先へのブラウザ送信試験が必要です。

2026-11-03：Apps Scriptバージョン3をデプロイして接続。ローカルLPからの申込保存・受付番号表示・重複防止・入金と返金の集計・同意と承認による本文公開を実機確認済み。チーム用アドレス宛ての控えメール送信処理成功とシートの「送信済」を確認。受信側への到着も今回のチーム用テストメールで確認済み。テスト申込は除去済み。

公開前の検証結果・修正内容・残っている公開手順は [QA-2026-11-03.md](QA-2026-11-03.md) を参照してください。画面側の異常系テストは `node fundraising.test.cjs`、受付APIのテストは `node apps-script/test.cjs` で実行します。
