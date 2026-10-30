extends SceneTree

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	root.content_scale_size = Vector2i(640, 640)
	root.size = Vector2i(640, 640)
	var directory := "res://.private/transitions"
	DirAccess.make_dir_recursive_absolute(directory)
	var sprite := Sprite2D.new()
	root.add_child(sprite)
	sprite.position = Vector2(320, 560)
	var label := Label.new()
	label.position = Vector2(24, 20)
	label.add_theme_color_override("font_color", Color("#34433a"))
	root.add_child(label)
	var output_frame := 0
	for action in ["lie-down", "rise"]:
		var path := ProjectSettings.globalize_path("res://../../assets/video/cat-" + action + "-v2/")
		var metadata: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(path + "extraction120.json"))
		assert(metadata.frameCount == 121 and metadata.fps == 24)
		var source := Image.load_from_file(path + "decoded120/frame-000.png")
		var scale_factor := 640.0 / source.get_width()
		var crop: Array = metadata.sharedCrop
		var anchor := Vector2(source.get_width() * 0.5 - crop[0], source.get_height() * 900.0 / 1024.0 - crop[1])
		sprite.scale = Vector2.ONE * scale_factor
		label.text = "趴下 · 过渡样稿" if action == "lie-down" else "起身 · 过渡样稿"
		for frame in 121:
			var bitmap := Image.load_from_file(path + "transparent120/frame-%03d.png" % frame)
			assert(not bitmap.is_empty())
			sprite.texture = ImageTexture.create_from_image(bitmap)
			sprite.offset = Vector2(bitmap.get_width(), bitmap.get_height()) / 2.0 - anchor
			await RenderingServer.frame_post_draw
			root.get_texture().get_image().save_png(directory + "/motion-%04d.png" % output_frame)
			output_frame += 1
	print("TRANSITION_PREVIEW: all242 source frames rendered; preview only, no state-machine integration")
	quit()
