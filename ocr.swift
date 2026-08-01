import Foundation
import Vision
import ImageIO

// 画像パスを受け取り、Vision(日本語OCR)の結果をJSONで標準出力に返すCLI
// 出力: {"width": px, "height": px, "lines": [{"text","confidence","x","y","w","h"}]}
// x/y/w/h は 0..1 の正規化座標、原点は左上

guard CommandLine.arguments.count > 1 else {
    FileHandle.standardError.write("usage: ocr_cli <image-path>\n".data(using: .utf8)!)
    exit(1)
}

let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
      let cgImage = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
    FileHandle.standardError.write("failed to load image\n".data(using: .utf8)!)
    exit(2)
}

var lines: [[String: Any]] = []

let request = VNRecognizeTextRequest { request, _ in
    guard let observations = request.results as? [VNRecognizedTextObservation] else { return }
    for obs in observations {
        guard let candidate = obs.topCandidates(1).first else { continue }
        let b = obs.boundingBox // 正規化座標・原点左下

        // 行内の空白区切りトークンごとの座標も返す
        // (横に並んだキャラ名が1行にまとめられても列単位で分離できるように)
        var tokens: [[String: Any]] = []
        let s = candidate.string
        var i = s.startIndex
        while i < s.endIndex {
            if s[i].isWhitespace { i = s.index(after: i); continue }
            var j = i
            while j < s.endIndex && !s[j].isWhitespace { j = s.index(after: j) }
            let range = i..<j
            var rect = b
            if let ro = (try? candidate.boundingBox(for: range)) ?? nil {
                rect = ro.boundingBox
            }

            // 1文字ごとの座標(隣接キャラ名がスペース無しで結合された場合の分離用)
            var chars: [[String: Any]] = []
            var ci = i
            while ci < j {
                let ni = s.index(after: ci)
                if let ro = (try? candidate.boundingBox(for: ci..<ni)) ?? nil {
                    let r = ro.boundingBox
                    chars.append([
                        "text": String(s[ci..<ni]),
                        "x": Double(r.origin.x),
                        "y": Double(1.0 - r.origin.y - r.size.height),
                        "w": Double(r.size.width),
                        "h": Double(r.size.height),
                    ])
                }
                ci = ni
            }

            tokens.append([
                "text": String(s[range]),
                "x": Double(rect.origin.x),
                "y": Double(1.0 - rect.origin.y - rect.size.height),
                "w": Double(rect.size.width),
                "h": Double(rect.size.height),
                "chars": chars,
            ])
            i = j
        }

        lines.append([
            "text": candidate.string,
            "confidence": Double(candidate.confidence),
            "x": Double(b.origin.x),
            "y": Double(1.0 - b.origin.y - b.size.height),
            "w": Double(b.size.width),
            "h": Double(b.size.height),
            "tokens": tokens,
        ])
    }
}
request.recognitionLevel = .accurate
request.recognitionLanguages = ["ja-JP", "en-US"]
request.usesLanguageCorrection = true

do {
    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    try handler.perform([request])
} catch {
    FileHandle.standardError.write("ocr failed: \(error)\n".data(using: .utf8)!)
    exit(3)
}

let payload: [String: Any] = ["width": cgImage.width, "height": cgImage.height, "lines": lines]
let data = try JSONSerialization.data(withJSONObject: payload)
FileHandle.standardOutput.write(data)
