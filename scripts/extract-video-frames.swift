import Foundation
import AVFoundation
import CoreImage
import ImageIO
import UniformTypeIdentifiers

guard CommandLine.arguments.count == 3 else { fatalError("Usage: swift extract-video-frames.swift INPUT.mp4 OUTPUT_DIR (all source frames)") }
let source = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
guard try FileManager.default.contentsOfDirectory(atPath: output.path).isEmpty else { fatalError("Output directory must be empty") }
let asset = AVURLAsset(url: source)
guard let track = asset.tracks(withMediaType: .video).first else { fatalError("Missing video track") }
let reader = try AVAssetReader(asset: asset)
let decoded = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
decoded.alwaysCopiesSampleData = false
reader.add(decoded)
guard reader.startReading() else { fatalError("Cannot start decoder") }
let context = CIContext(options: [.useSoftwareRenderer: false])
var times: [Double] = []
while let sample = decoded.copyNextSampleBuffer() {
    try autoreleasepool {
        guard let buffer = CMSampleBufferGetImageBuffer(sample) else { fatalError("Missing decoded pixels") }
        let ci = CIImage(cvPixelBuffer: buffer).transformed(by: track.preferredTransform)
        guard let image = context.createCGImage(ci, from: ci.extent) else { fatalError("Cannot render decoded frame") }
        let file = output.appendingPathComponent(String(format: "frame-%03d.png", times.count))
        guard let dest = CGImageDestinationCreateWithURL(file as CFURL, UTType.png.identifier as CFString, 1, nil) else { fatalError("PNG destination failed") }
        CGImageDestinationAddImage(dest, image, nil)
        guard CGImageDestinationFinalize(dest) else { fatalError("PNG encoding failed") }
        times.append(CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sample)))
    }
}
guard reader.status == .completed else { fatalError("Decoder failed: \(String(describing: reader.error))") }
let metadata: [String: Any] = ["source": source.lastPathComponent, "durationSeconds": CMTimeGetSeconds(asset.duration), "frameCount": times.count, "fps": track.nominalFrameRate, "sampleTimesSeconds": times, "method": "AVAssetReader sequential decode; no temporal resampling"]
try JSONSerialization.data(withJSONObject: metadata, options: [.prettyPrinted, .sortedKeys]).write(to: output.appendingPathComponent("sampling.json"))
print("Decoded all \(times.count) source frames at \(track.nominalFrameRate) fps")
