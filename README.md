# MML Player PWA

iPhone Safariで使える、オフライン対応の最小MMLプレイヤーPWAです。サーバー、DB、ログインなしの静的ファイルだけで動き、GitHub Pagesなどに配置できます。

## できること

- MMLテキストの入力、再生、停止、先頭に戻る
- `localStorage` によるMMLの自動保存と復元
- Web Audio APIによる矩形波再生
- Service Worker + Cache Storageによる初回アクセス後のオフライン起動
- 複数トラックの同時再生
- parser/compilerのユニットテスト

## 対応MML

最小仕様として、以下に対応しています。

- `T<number>`: テンポ
- `O<number>`: オクターブ
- `L<number>`: デフォルト音長
- `C D E F G A B`: 音符
- `R`: 休符
- `#` / `+` / `-`: 半音上げ、半音下げ
- `.`: 付点
- `<` / `>`: オクターブ上下
- `V<number>`: 音量 0-15
- `Q<number>`: ゲートタイム 1-8
- `@<number>`: 音色変更 0-15
- `,`: トラック区切り

例:

```mml
T120 O4 L8 V12 Q7
C D E F G A B > C
```

音色番号は現在以下のように割り当てています。未割り当て番号は矩形波として再生します。

| コマンド | 音色 |
| --- | --- |
| `@0` | 矩形波 |
| `@1` | サイン波 |
| `@2` | 三角波 |
| `@3` | ノコギリ波 |
| `@4` | FM風ベル |
| `@5` | FM風ベース |
| `@6` | ノイズ |

FM音色はWeb Audio APIのOscillatorNodeを使った軽量な2オペレータ風エミュレーションです。特定のFM音源チップとの完全互換ではありません。

例:

```mml
T132 O4 L8 @0 C D E F, O5 @4 C E G > C, O2 @5 C4 G4, O3 @6 C8 R8 C8 R8
```

## 開発

```bash
npm install
npm run dev
```

ViteのURLを開くとアプリを試せます。iOS SafariではAudioContextの制約があるため、音声は必ず画面の `Play` ボタンを押した後に開始します。

## テスト

```bash
npm test
```

`src/mml` 配下のparser/compilerはUIから分離してあり、Vitestでテストします。

## ビルド

```bash
npm run build
```

成果物は `dist/` に出力されます。`dist/` を静的ホスティングすれば動作します。

## GitHub Pagesへの配置

このプロジェクトは、リポジトリ名が `mml-player-pwa` である前提で `vite.config.ts` の `base` を次のように設定しています。

```ts
base: "/mml-player-pwa/"
```

GitHubアカウントは既存の `marinyan` を使う想定です。公開URLは次の形になります。

```text
https://marinyan.github.io/mml-player-pwa/
```

リポジトリ名を変える場合は、`vite.config.ts` のコメントに従って `base` を `"/your-repo-name/"` に変更してください。カスタムドメインでルート配信する場合は `"/"` にします。

GitHub Actions workflowは `.github/workflows/pages.yml` にあります。`main` ブランチへpushすると、以下を自動実行します。

1. `npm ci`
2. `npm test`
3. `npm run build`
4. GitHub Pagesへ `dist/` を公開

GitHub側では、Repository SettingsのPagesでSourceを `GitHub Actions` に設定してください。

## オフライン動作

本番ビルドではService Workerを登録します。初回オンラインアクセス時にアプリシェルと取得済みアセットをCache Storageへ保存し、以後はオフラインでも起動できます。

開発サーバー中はService Workerを登録しません。オフライン挙動は `npm run build` 後に静的配信またはGitHub Pages上で確認してください。

## 今回のスコープ外

- MIDI出力
- 外部音源
- バックグラウンド再生
- iCloud連携
- ファイル関連付け
- 高度なMML互換性
