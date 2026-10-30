import Foundation
import AVFoundation
import AppKit
import CoreVideo

// Encodes frames captured by Godot's viewport; never modifies source artwork.
guard (3...4).contains(CommandLine.arguments.count) else {
    fatalError("Usage: swift encode-game-recording.swift FRAME_DIRECTORY OUTPUT.mp4 [FPS]")
}
let fps = CommandLine.arguments.count == 4 ? Int32(CommandLine.arguments[3]) ?? 0 : 10
guard (1...120).contains(fps) else { fatalError("FPS must be between 1 and 120") }
let directory = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
    .filter { $0.lastPathComponent.hasPrefix("motion-") && $0.pathExtension == "png" }
    .sorted { $0.lastPathComponent < $1.lastPathComponent }
guard let first = files.first, let bitmap = NSBitmapImageRep(data: try Data(contentsOf: first)) else {
    fatalError("No rendered frames")
}
guard !FileManager.default.fileExists(atPath: output.path) else {
    fatalError("Output already exists; choose a new filename")
}
let width = bitmap.pixelsWide, height = bitmap.pixelsHigh
let writer = try AVAssetWriter(outputURL: output, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: width,
    AVVideoHeightKey: height,
    AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 4_000_000]
])
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
    kCVPixelBufferWidthKey as String: width,
    kCVPixelBufferHeightKey as String: height,
    kCVPixelBufferCGImageCompatibilityKey as String: true,
    kCVPixelBufferCGBitmapContextCompatibilityKey as String: true
])
writer.add(input)
guard writer.startWriting() else { fatalError("Could not start writer: \(String(describing: writer.error))") }
writer.startSession(atSourceTime: .zero)
for (index, file) in files.enumerated() {
    while !input.isReadyForMoreMediaData {
        guard writer.status == .writing else { fatalError("Writer failed: \(String(describing: writer.error))") }
        Thread.sleep(forTimeInterval: 0.005)
    }
    guard let image = NSBitmapImageRep(data: try Data(contentsOf: file))?.cgImage else { fatalError("Invalid frame") }
    var pixel: CVPixelBuffer?
    guard CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pixel) == kCVReturnSuccess, let buffer = pixel else {
        fatalError("Could not allocate frame")
    }
    CVPixelBufferLockBaseAddress(buffer, [])
    guard let context = CGContext(data: CVPixelBufferGetBaseAddress(buffer), width: width, height: height,
        bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buffer), space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue) else { fatalError("Could not create frame context") }
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    CVPixelBufferUnlockBaseAddress(buffer, [])
    guard adaptor.append(buffer, withPresentationTime: CMTime(value: Int64(index), timescale: fps)) else {
        fatalError("Could not encode frame: \(String(describing: writer.error))")
    }
}
input.markAsFinished()
let complete = DispatchSemaphore(value: 0)
writer.finishWriting { complete.signal() }
complete.wait()
guard writer.status == .completed else { fatalError("Recording failed: \(String(describing: writer.error))") }
print("Recorded \(files.count) frames at \(fps) fps: \(output.path)")
