# TAP REC

全画面をタップするだけの録音PWA（Android Chrome向け）。音声はサーバーに送信しません。

操作：待機→録音→録音完了→再生→一時停止／再開→再生終了→削除と新規録音。再生が最後まで終わると次のタップで録音を削除します。録音済みの音声はIndexedDBに一件だけ保管します。録音中にアプリを閉じた場合、録音途中のデータは復元できません。

## 公開
GitHub → Settings → Pages → Build and deployment → Deploy from a branch → main / (root) → Save。
URL: https://doribar.github.io/tap-rec-pwa/

Android Chromeで開き、「アプリをインストール」または「ホーム画面に追加」。初回はマイクを許可してください。HTTPSが必要です。

画面の消灯防止はScreen Wake Lock APIを利用しますが、端末状況により解除されることがあります。スマートフォン実機での録音動作確認は未実施です。
