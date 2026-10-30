extends SceneTree

var checks := 0
var directory := "res://.private/life-video"

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	root.content_scale_size = Vector2i(640, 840)
	root.size = Vector2i(640, 840)
	DirAccess.make_dir_recursive_absolute(directory)
	var pack = GameData.read_json("res://data/pet.json")
	assert(GameData.validate_pet(pack).is_empty())
	checks += 1
	if not "--physics-only" in OS.get_cmdline_user_args():
		var stage := Node2D.new()
		root.add_child(stage)
		var pets: Array[HomePet] = []
		var actions = ["eat", "pet", "sleep"]
		for index in 3:
			var pet := HomePet.new()
			stage.add_child(pet)
			var display_pack = pack.duplicate(true)
			display_pack.scale = pack.scale * 4.0
			pet.configure(display_pack, stage)
			pet.position = Vector2(320, 240 + index * 260)
			pet._set_state(actions[index])
			assert(pet.sprite.material == null and pet.sprite.sprite_frames.get_frame_count(actions[index]) == 121)
			checks += 1
			pets.append(pet)
			var label := Label.new()
			label.text = ["进食", "抚摸", "打盹"][index]
			label.position = pet.position + Vector2(-20, 12)
			label.add_theme_color_override("font_color", Color("#34433a"))
			stage.add_child(label)
		await create_timer(0.4).timeout
		for pet in pets:
			assert(pet.sprite.frame > 0)
			pet.sprite.pause()
			checks += 1
		for frame in ([0, 15, 35] if "--inspect" in OS.get_cmdline_user_args() else range(242)):
			for pet in pets:
				var fps: float = pack.clips[pet.state].fps
				pet.sprite.set_frame_and_progress(int(frame * fps / 24.0) % pack.clips[pet.state].frames.size(), 0.0)
			await RenderingServer.frame_post_draw
			if "--record" in OS.get_cmdline_user_args():
				root.get_texture().get_image().save_png(directory + "/motion-%04d.png" % frame)
			if frame in [0, 15, 35]:
				root.get_texture().get_image().save_png(directory + "/pose-%03d.png" % frame)
		stage.queue_free()
		await process_frame
	if "--render-only" in OS.get_cmdline_user_args():
		print("LIFE_VIDEO_RENDER: ", checks, " checks passed")
		quit()
		return
	var room = load("res://scenes/room.tscn").instantiate()
	root.add_child(room)
	room.configure(GameData.read_json("res://data/interior.json"), pack)
	room.pet.automatic = false
	for tick in 120:
		await physics_frame
		if room.navigation_ready: break
	assert(room.navigation_ready)
	checks += 1
	for action in ["sleep", "eat"]:
		var target: Dictionary = room.definition.interactions.filter(func(i): return i.action == action)[0]
		assert(room.pet.go_to(GameData.point(target.position), target))
		for tick in 1200:
			await physics_frame
			if room.pet.state == action: break
		assert(room.pet.state == action)
		assert(room.pet.sprite.sprite_frames.get_frame_count(action) == 121)
		checks += 2
		if not "--physics-only" in OS.get_cmdline_user_args():
			await RenderingServer.frame_post_draw
			root.get_texture().get_image().save_png(directory + "/room-" + action + ".png")
	room.pet.stroke()
	assert(room.pet.state == "pet")
	await create_timer(0.3).timeout
	room.pet.stroke()
	assert(room.pet.sprite.frame == 0 and room.pet.sprite.is_playing())
	checks += 1
	await create_timer(float(pack.clips.pet.frames.size()) / pack.clips.pet.fps + 0.2).timeout
	assert(room.pet.state == "rest")
	checks += 2
	print("LIFE_VIDEO: ", checks, " checks passed")
	quit()
