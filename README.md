# メロンパン日記

スマホで気軽にメロンパンを記録・振り返りできる、React + TypeScript + Vite 製の静的PWAです。データと写真はブラウザの IndexedDB にのみ保存され、外部サーバーやAPIキーは使用しません。

## 起動・ビルド

Node.js 20以降と pnpm を用意して、プロジェクト直下で実行します。

```bash
pnpm install
pnpm dev
pnpm build
pnpm preview
```

## 無料デプロイ

Vercel はGitHubへpush後にリポジトリをImportし、Framework PresetをVite、Build Commandを`pnpm build`、Output Directoryを`dist`にします。Cloudflare Pagesでも同じくBuild commandを`pnpm build`、Build output directoryを`dist`に設定します。どちらも静的ホスティングで動作します。

## データについて

記録、評価設定、選択した写真はIndexedDBの`melonpan-diary`データベースに保存されます。そのため別のブラウザ・端末には同期されません。設定画面のJSONエクスポートには全記録・写真・設定が含まれ、復元に使えます。CSVは表計算ソフト向けのUTF-8 BOM付きです。

`public/sw.js` と `manifest.webmanifest` によりホーム画面へ追加でき、読み込んだアプリ資産はオフラインでも利用できます。
