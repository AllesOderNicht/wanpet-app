extends SceneTree

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	root.content_scale_size = Vector2i(640, 720)
	root.size = Vector2i(640, 720)
	var direction := "left" if "--left" in OS.get_cmdline_user_args() else "right"
	var directory := "res://.private/walk-video-" + direction
	DirAccess.make_dir_recursive_absolute(directory)
	var pack = GameData.read_json("res://data/walk-video-candidate.json")
	var clip: Dictionary = pack.clips["walk_" + direction]
	assert(clip.frames.size() == 121 and clip.fps == 24)
	if not "--physics-only" in OS.get_cmdline_user_args():
		var stage := Node2D.new()
		root.add_child(stage)
		var pet := HomePet.new()
		stage.add_child(pet)
		var display_pack = pack.duplicate(true)
		display_pack.scale *= 4.0
		pet.configure(display_pack, stage)
		pet.position = Vector2(320, 300)
		pet.facing = direction
		pet._set_state("walk")
		var companion := HomePet.new()
		stage.add_child(companion)
		companion.configure(display_pack, stage)
		companion.position = Vector2(320, 620)
		companion.facing = "right" if direction == "left" else "left"
		companion._set_state("walk")
		for entry in [[pet, direction], [companion, companion.facing]]:
			var label := Label.new()
			label.text = "向左慢走" if entry[1] == "left" else "向右慢走"
			label.position = entry[0].position + Vector2(-36, 12)
			label.add_theme_color_override("font_color", Color("#34433a"))
			stage.add_child(label)
		await create_timer(0.3).timeout
		assert(pet.sprite.frame > 0)
		pet.sprite.pause()
		companion.sprite.pause()
		for i in 242:
			pet.sprite.set_frame_and_progress(i % 121, 0.0)
			companion.sprite.set_frame_and_progress(i % 121, 0.0)
			await RenderingServer.frame_post_draw
			root.get_texture().get_image().save_png(directory + "/motion-%04d.png" % i)
		stage.queue_free()
		await process_frame
	var room = load("res://scenes/room.tscn").instantiate()
	root.add_child(room)
	room.configure(GameData.read_json("res://data/interior.json"), pack)
	room.pet.automatic = false
	for tick in 120:
		await physics_frame
		if room.navigation_ready: break
	var target := Vector2(95, 410) if direction == "left" else Vector2(290, 410)
	room.pet.position = Vector2(290, 410) if direction == "left" else Vector2(95, 410)
	assert(room.pet.go_to(target))
	var max_step := 0.0
	var last: Vector2 = room.pet.position
	var walk_frames := 0
	for tick in 900:
		await physics_frame
		max_step = maxf(max_step, last.distance_to(room.pet.position))
		last = room.pet.position
		if room.pet.state != "walk": break
		if room.pet.facing == direction:
			assert(room.pet.sprite.sprite_frames.get_frame_count("walk_" + direction) == 121)
			walk_frames += 1
	assert(walk_frames > 120)
	assert(room.pet.position.distance_to(target) < 8)
	assert(max_step <= pack.speed / Engine.physics_ticks_per_second + 0.1)
	if not "--physics-only" in OS.get_cmdline_user_args():
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(directory + "/room-arrival.png")
	print(direction, " WALK_VIDEO: 121 frames at 24fps; room route and bounded physical steps passed; physics_only=", "--physics-only" in OS.get_cmdline_user_args(), "")
	quit()
