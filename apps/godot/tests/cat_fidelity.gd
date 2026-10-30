extends SceneTree

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	root.content_scale_size = Vector2i(1000, 720)
	root.size = Vector2i(1000, 720)
	var stage := Control.new()
	root.add_child(stage)
	var sources = [
		["图一原猫（保留原背景）", "res://assets/engawa/home-reference.png", Rect2(0, 1000, 610, 330)],
		["现有 24 帧首帧", "res://assets/engawa/cat-idle-24.png", Rect2(0, 0, 256, 256)]
	]
	for i in sources.size():
		var label := Label.new()
		label.text = sources[i][0]
		label.position = Vector2(24, 20 + i * 350)
		label.add_theme_color_override("font_color", Color("#34433a"))
		stage.add_child(label)
		var art := TextureRect.new()
		var atlas := AtlasTexture.new()
		atlas.atlas = load(sources[i][1])
		atlas.region = sources[i][2]
		art.texture = atlas
		art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		art.position = Vector2(200, 50 + i * 350)
		art.size = Vector2(610, 300)
		stage.add_child(art)
	await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png("res://.private/cat-fidelity-before.png")
	quit()
