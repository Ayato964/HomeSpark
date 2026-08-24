# Irodori-TTS-Lite API リファレンス

本リファレンスは、4-bit 量子化モデルを用いた日本語音声合成ランタイム（`Irodori-TTS-Lite`）をラップした FastAPI サーバーの API 仕様書です。

## 1. ベース情報
* **ベース URL**: `http://localhost:8080`
* **稼働ポート**: `8080`
* **レスポンス形式**: 音声データストリーム（`audio/wav`）

### 1.1 対話型 API ドキュメント (Swagger / ReDoc)
FastAPI の標準機能により、サーバー起動中はブラウザから以下のURLにアクセスするだけで、インタラクティブなAPIテストや仕様の確認 G可能です。
* **Swagger UI (推奨)**: `http://localhost:8080/docs`
* **ReDoc**: `http://localhost:8080/redoc`

---

## 2. エンドポイント仕様

### `GET /tts` (音声合成エンドポイント)
テキストを与えて、即時に音声波形（WAV）を取得します。モデルはメモリに常駐しているため、コールドスタートなし（約 100 ms）で応答します。

#### 2.1 リクエストパラメータ (Query Parameters)

| パラメータ名 | 型 | 必須 | デフォルト値 | 説明 |
| :--- | :---: | :---: | :---: | :--- |
| **`text`** | `string` | **必須** | - | 音声合成したい日本語のテキスト（URLエンコードが必要）。 |
| **`steps`** | `integer` | 任意 | `6` | RF Eulerサンプリングのステップ数。値を大きくすると品質が上がりますが処理時間が増加します。4-bit量子化モデルでは `6` 〜 `10` が推奨値です（範囲: 1〜100）。 |

#### 2.2 レスポンス (Responses)

##### 🟢 `200 OK` (成功時)
WAV 形式（16-bit PCM, モノラル, 44.1 kHz）のオーディオストリームが返却されます。
* `Content-Type`: `audio/wav`

##### 🔴 `500 Internal Server Error` (推論エラー時)
推論中、または WAV 変換中にエラーが発生した場合に返されます。
* `Content-Type`: `application/json`
* レスポンス例:
  ```json
  {
    "detail": "Inference error: Error details here..."
  }
  ```

##### 🔴 `503 Service Unavailable` (モデル未ロード時)
サーバー起動直後で、バックグラウンドでのモデルの初期化ロードが完了していない場合に返されます。
* `Content-Type`: `application/json`
* レスポンス例:
  ```json
  {
    "detail": "Model not loaded yet"
  }
  ```

---

## 3. クライアント実装例

### 3.1 curl (コマンドライン)
`-G` オプションと `--data-urlencode` を指定することで、日本語のマルチバイト文字列を安全にエンコードしてGETリクエストを送信できます。

```bash
curl -G "http://localhost:8080/tts" \
    --data-urlencode "text=こんにちは！APIのテストです。" \
    --data-urlencode "steps=6" \
    -o output.wav
```

### 3.2 Python (requests)
```python
import requests

url = "http://localhost:8080/tts"
params = {
    "text": "こんにちは！Pythonからのリクエストテストです。",
    "steps": 6
}

response = requests.get(url, params=params)

if response.status_code == 200:
    with open("output.wav", "wb") as f:
        f.write(response.content)
    print("音声ファイルが正常に保存されました。")
else:
    print(f"エラーが発生しました: {response.json()}")
```

### 3.3 JavaScript (Fetch API / Node.js)
```javascript
const url = new URL("http://localhost:8080/tts");
url.searchParams.append("text", "こんにちは！ブラウザからのテストです。");
url.searchParams.append("steps", "6");

fetch(url)
  .then(response => {
    if (!response.ok) {
        throw new Error("TTS generation failed");
    }
    return response.blob();
  })
  .then(blob => {
    // 例: ブラウザ上で再生可能なオーディオオブジェクトを作成
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    audio.play();
  })
  .catch(error => console.error("Error:", error));
```

---

## 4. パフォーマンス設計の特性
* **超低レイテンシ**:
  プロセス開始時の `lifespan` イベントでモデル（DiT）とコーデック（DACVAE）を一度だけ GPU にロードし、メモリ上に常駐させます。これにより、毎回のインポートやCUDA初期化オーバーヘッドが不要になり、実生成処理のみ（**約 100 ms**）でレスポンスします。
* **メモリ最適化 (VRAM約 2.09 GB)**:
  電子透かし（SilentCipher）のロードをスキップし、さらに DiT & DACVAE 双方に 4-bit 量子化を適用しているため、フルパイプラインの VRAM 割り当てを約 2.09 GB に抑えています。
