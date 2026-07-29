# 防御編成集計ツール(Vercel版)

ブルーアーカイブ「戦術対抗戦」の防御側編成を手入力で記録・集計するツールです。
サーバーを持たない完全な静的サイトで、Vercelにそのままデプロイできます。

元になったローカル版(Node + `data.json`保存): `/Users/kiyui/defense-comp-tracker/`

## この版の特徴

- **サーバー不要**: `index.html`1枚の静的サイト。データはブラウザの`localStorage`に保存
- **キャラ名・画像は[ba-timeline](https://ba-timeline.vercel.app)と共有**: `characters.json`をブラウザから直接fetch(CORS許可済み)。
  ba-timeline側でキャラを追加すれば自動的にこちらの候補・画像にも反映される
- ストライカー1〜4・スペシャル1〜2の6枠入力、役割(STR/SPE)の食い違い警告つき

## ローカルでの動作確認

```sh
node dev-server.js
```

→ http://localhost:3777 (ただの静的ファイルサーバー。`index.html`を直接ブラウザで開いても動く)

## Vercelへのデプロイ

1. このフォルダをGitHubリポジトリにする(未作成なら`git init`して新規リポジトリを作成・push)
2. Vercelでそのリポジトリを "Import Project"。フレームワークは検出不要("Other"のままでOK)
   - `vercel.json`で`outputDirectory: "."`を指定済みなので追加設定は不要
3. デプロイ後、本番URLで動作確認

## データについて(重要)

- 保存先は**ブラウザのlocalStorage**(このツール単体、サーバー保存なし)。
  - 端末・ブラウザが変わるとデータは引き継がれない
  - ブラウザのキャッシュ/サイトデータを消すと消える
  - → **「データのバックアップ」欄の「エクスポート」で定期的にJSONダウンロードを推奨**
- 旧ローカル版(`/Users/kiyui/defense-comp-tracker/data.json`)のデータをこちらに移したい場合:
  1. `/Users/kiyui/defense-comp-tracker/data.json`をこの画面の「インポート」で読み込む
  2. `{records:[...]}`形式・配列そのものの形式のどちらも読み込み可能。既存データとはID重複を除いてマージされる

## ファイル構成

- `index.html` — アプリ本体(入力フォーム・localStorage永続化・集計・ba-timeline連携)
- `dev-server.js` — ローカル確認用の最小静的サーバー(本番では使わない)
- `vercel.json` — Vercelを静的サイトとして扱わせるための設定
