# Golf Practice Log

スマホで練習後すぐに入力するための個人用ゴルフ練習ログです。HTML/CSS/JavaScriptだけで動き、データはブラウザのlocalStorageに保存します。

## 使い方

1. `index.html` をブラウザで開きます。
2. トップの `A練`、`B練`、`屋外練`、`自由入力` からテンプレートを選びます。
3. 日付、場所、体調を入力します。A練とB練では場所に `zenゴルフレンジ` が自動入力されます。
4. クラブごとのカードで球数や成功数を入力します。球数は初期値が `20` で、数字欄への直接入力と `+` / `-` ボタンの両方が使えます。
5. 必要ならクラブ別メモと総評メモを書きます。
6. `保存する` を押すと、画面上部に今日の記録サマリーが表示されます。
7. サマリー内の `コピー` ボタンで、ChatGPTに貼り付けやすい振り返り用テキストをコピーできます。
8. `CSV` ボタンで保存済みデータをCSVとしてダウンロードできます。

## テンプレート

### A練

- 7番アイアン: 球数、130y成功数、140y成功数、150y成功数、メモ
- ドライバー: 球数、180y成功数、190y成功数、200y成功数、最大飛距離、ミス数、メモ
- SW60y: 球数、成功率、メモ
- UT: 球数、150y成功数、160y成功数、ミス数、メモ

### B練

- 7番アイアン: 球数、130y成功数、140y成功数、150y成功数、メモ
- PW90y
- 5W: 球数、170y成功数、180y成功数、190y成功数、最大飛距離、ミス数、メモ
- パター10y: 球数、成功率、メモ
- PW20y: 球数、成功率、メモ

PW90y、屋外練、自由入力の標準項目は `球数`、`成功数`、`ミス数` です。成功率の入力欄は初期状態では空欄です。

## データ項目

保存データは `golf-practice-logs-v1` というlocalStorageキーにJSON配列で保存されます。Google Sheets連携しやすいように、練習1回の基本情報とクラブ別の明細を分けています。

### 練習ログ

- `id`: 練習ログID
- `schemaVersion`: データ構造のバージョン
- `templateName`: 使用テンプレート名
- `date`: 練習日
- `location`: 場所
- `condition`: 体調
- `overallMemo`: 総評メモ
- `createdAt`: 保存日時
- `clubs`: クラブ別記録の配列

### クラブ別記録

- `clubId`: クラブID
- `clubName`: 表示名
- `memo`: クラブ別メモ
- `metrics`: 入力項目の配列
- `successRate`: 成功率。成功数系の項目がある場合は `成功数合計 / 球数`、成功率を直接入力する項目ではその値を使います。

### 入力項目

- `key`: 項目キー
- `label`: 画面表示名
- `kind`: `count`、`distance`、`percent` のいずれか
- `value`: 入力値

## CSV形式

CSVは1行1項目の明細形式です。主な列は以下です。

- `log_id`
- `date`
- `template`
- `location`
- `condition`
- `overall_memo`
- `club_id`
- `club_name`
- `club_memo`
- `success_rate`
- `metric_key`
- `metric_label`
- `metric_kind`
- `metric_value`
- `created_at`

## GitHub Pagesで公開する

このリポジトリは、GitHub Pagesの公開元を `main` ブランチの `/root` にすると、そのままiPhoneのSafariから使えます。

公開後のURLは通常、以下の形式になります。

```text
https://<GitHubユーザー名>.github.io/<リポジトリ名>/
```

### iPhoneで使いやすくする

1. iPhoneのSafariで公開URLを開きます。
2. 共有ボタンから `ホーム画面に追加` を選びます。
3. ホーム画面のアイコンから開くと、すぐ練習ログを入力できます。

データはブラウザのlocalStorageに保存されます。同じGitHub PagesのURLでも、別の端末や別ブラウザには自動同期されません。
