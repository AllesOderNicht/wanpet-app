extends SceneTree

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	root.size = Vector2i(390, 844)
	var home := EngawaHome.new()
	root.add_child(home)
	home.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var directory := "res://.private/engawa-video120"
	DirAccess.make_dir_recursive_absolute(directory)
	await process_frame
	assert(home.cat is AnimatedSprite2D)
	assert(home.cat.material == null)
	assert(home.cat.sprite_frames.get_frame_count("rest") == 121)
	assert(home.cat.sprite_frames.get_animation_speed("rest") == 24.0)
	var total_duration := 0.0
	for index in 121:
		total_duration += home.cat.sprite_frames.get_frame_duration("rest", index) / 24.0
	assert(absf(total_duration - 121.0 / 24.0) < 0.0001)
	home.cat.pause()
	for index in 121:
		home.cat.set_frame_and_progress(index, 0.0)
		home._align_cat()
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(directory + "/pose-%02d.png" % index)
	if "--record" in OS.get_cmdline_user_args():
		for frame in 240:
			home.seek_pose(frame / 30.0)
			await RenderingServer.frame_post_draw
			root.get_texture().get_image().save_png(directory + "/motion-%04d.png" % frame)
	var route := []
	home.open_requested.connect(func(page): route.append(page))
	home.canvas.get_node("准备行囊").pressed.emit()
	home.canvas.get_node("收藏").pressed.emit()
	assert(route == ["bag", "collection"])
	home.stroke()
	assert(home.cat.is_playing() and home.cat.frame == 0)
	await create_timer(0.6).timeout
	assert(home.cat.frame > 0)
	home.set_reduced_motion(true)
	var frozen := home.cat.frame
	var progress := home.cat.frame_progress
	await create_timer(0.3).timeout
	assert(home.cat.frame == frozen and home.cat.frame_progress == progress)
	home.set_pet_available(false)
	assert(not home.cat.visible and not home.cat.is_playing())
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(directory + "/away.png")
	home.set_pet_available(true)
	home.set_reduced_motion(false)
	assert(home.cat.visible and home.cat.is_playing())
	print("VIDEO120: 121 atlas frames, no cat shader, actual playback, navigation, stroke, reduced motion, away/resume passed")
	if "--keep-open" in OS.get_cmdline_user_args():
		return
	quit()
