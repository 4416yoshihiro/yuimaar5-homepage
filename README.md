# 結マール５ 公式サイト・資金造成LP

一般社団法人ベースボール沖縄が運営するBASEBALL5チーム「結マール５」のサイトです。

## レビュー中：日本選手権 遠征支援LP

入口は **fundraising.html** です。現在は確認用プレビューで、申込受付・メール送信・決済・シート連携は未接続です。

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

http://127.0.0.1:8765/fundraising.html を開いてください。ビルドや追加ライブラリは不要です。

| ファイル | 役割 |
| --- | --- |
| fundraising.html | 資金造成LPの構成・原稿・フォーム |
| fundraising.css | 資金造成LP専用スタイル |
| fundraising.js | 金額選択・振込案内などのプレビュー動作 |
| assets/fundraising-team-main.jpg | ユーザー指定のメイン写真 |
| REVIEW.md | レビュー項目・未完了機能・公開前確認 |
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
