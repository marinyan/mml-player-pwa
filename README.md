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
- `&`: タイ / スラー。例 `C&C`、`C&D`
- `//`: 行コメント。`//` から行末までを無視
- `#TIME n/d`: 拍子設定。例 `#TIME 4/4`、`#TIME 3/4`、`#TIME 6/8`
- `|`: 小節線。発音イベントは生成しない
- `[: ... :n]`: リピート。`n` 回繰り返し。例 `[: C D :3]`
- `[: ... :]`: 回数省略リピート。2回繰り返し
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

`@0` から `@15` は内蔵音色予約です。`@16` から `@63` はMML本文内の `%fm ... %end` ブロックで定義するユーザーFM音色として扱います。音色定義はlocalStorageではなくMML本文に含める方針なので、txt/mmlインポート・エクスポートで曲と一緒に持ち運べます。現時点では2op/4op FMに対応し、FM音色エディタUIは未実装です。`algorithm=0` は `op4 -> op3 -> op2 -> op1` の直列として扱い、op3/op4を省略した場合は従来の2opとして扱います。

```mml
%fm @16 name="Bell"
algorithm=0
feedback=2
op1 ratio=1.00 detune=0 level=1.00 attack=0.01 decay=0.30 sustain=0.40 release=0.20
op2 ratio=2.00 detune=0 level=0.60 attack=0.01 decay=0.20 sustain=0.00 release=0.10
%end

T120 O4 L8
@16 C D E G > C
```

```mml
%fm @17 name="FourOpBell"
algorithm=0
feedback=3
op1 ratio=1.00 detune=0 level=0.90 attack=0.01 decay=0.40 sustain=0.30 release=0.20
op2 ratio=2.00 detune=0 level=0.50 attack=0.01 decay=0.30 sustain=0.20 release=0.15
op3 ratio=3.00 detune=0 level=0.35 attack=0.01 decay=0.20 sustain=0.10 release=0.12
op4 ratio=4.00 detune=0 level=0.25 attack=0.01 decay=0.15 sustain=0.00 release=0.10
%end

T120 O4 L8
@17 C E G > C
```

例:

```mml
T132 O4 L8 @0 C&C D E F, O5 @4 C&E G > C, O2 @5 C4 G4, O3 @6 C8 R8 C8 R8
```

拍子と小節線は再生位置の整理、小節長チェック、将来の表示や書き出しのための内部情報として扱います。デフォルト拍子は `4/4` です。`#TIME n/d` はグローバルな拍子設定として扱い、分母は `1`, `2`, `4`, `8`, `16` に対応しています。

明示小節線 `|` までの長さが小節長より短い場合は、内部的に不足分の休符を補完します。長さが小節長を超えた場合は、内部的に仮想小節線を挿入します。どちらの場合も元のMML本文は自動で書き換えません。長い音符が小節をまたぐ場合でも、再生用のNoteEvent自体は分割しません。

リピートは再生前の内部展開として扱います。元のMML本文は自動で書き換えず、txt/mmlインポート・エクスポートでも `[: ... :n]` の記法をそのまま保持します。回数省略時は2回です。現時点ではネスト、1番括弧/2番括弧、セーニョ、ダルセーニョ、コーダは未実装です。

```mml
#TIME 4/4
T120 O4 L4
[: C D E F | :2]
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

## WAVエクスポート

Fileメニューの `Export WAV` から、現在エディタにあるMMLを `mml-export.wav` として保存できます。WAV出力は現在のparser/compilerが生成するSongを使うため、`%fm ... %end` の2OP/4OP FM音色、内蔵音色、複数トラック、リピート展開、拍子/小節線による内部休符補完や仮想小節線処理を反映します。

出力形式は 44.1kHz / 16bit PCM / mono のRIFF/WAVEです。長い曲ではファイルサイズが大きくなるため、推定サイズが大きい場合は確認を出します。

WAVエクスポートは音声ファイルの保存であり、MML本文のtxt/mmlエクスポートとは別扱いです。WAVを書き出しても「未エクスポート/最後のエクスポート後に変更あり」の状態は解除されません。MML本文を保存済みにするのは `Export mml` のみです。

リアルタイム再生とWAV出力は同じ `Synth` 音源処理を使う方針です。WAV専用に別の音色処理を持たせず、AudioContextとOfflineAudioContextの両方から同じスケジューリング経路を使います。
