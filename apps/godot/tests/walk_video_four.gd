extends SceneTree

var checks := 0
var failures: Array[String] = []

func _initialize() -> void:
	run.call_deferred()

func verify(value: bool, label: String) -> void:
	checks += 1
	if not value:
		failures.append(label)
		push_error(label)

func run() -> void:
	var pack = GameData.read_json("res://data/walk-video-candidate.json")
	var directory := "res://.private/walk-video-four"
	DirAccess.make_dir_recursive_absolute(directory)
	verify(GameData.validate_pet(pack).is_empty(), "candidate validates")
	var directions = ["front", "back", "left", "right"]
	for direction in directions:
		verify(pack.clips["walk_" + direction].frames.size() == 121, direction + " all121frames")
		verify(pack.clips["walk_" + direction].fps == 24, direction + " source24fps")
	if "--record" in OS.get_cmdline_user_args() or "--inspect" in OS.get_cmdline_user_args():
		root.content_scale_size = Vector2i(720, 720)
		root.size = Vector2i(720, 720)
		var stage := Node2D.new()
		root.add_child(stage)
		var pets: Array[HomePet] = []
		for i in 4:
			var pet := HomePet.new()
			stage.add_child(pet)
			var display_pack = pack.duplicate(true)
			display_pack.scale *= 4.0
			pet.configure(display_pack, stage)
			pet.position = Vector2(185 + (i % 2) * 350, 290 + (i / 2) * 320)
			pet.facing = directions[i]
			pet._set_state("walk")
			pet.sprite.pause()
			pets.append(pet)
			var label := Label.new()
			label.text = ["向前", "向后", "向左", "向右"][i]
			label.position = pet.position + Vector2(-16, 12)
			label.add_theme_color_override("font_color", Color("#34433a"))
			stage.add_child(label)
		for frame in ([0, 12, 60, 120] if "--inspect" in OS.get_cmdline_user_args() else range(242)):
			for pet in pets: pet.sprite.set_frame_and_progress(frame % 121, 0.0)
			await RenderingServer.frame_post_draw
			root.get_texture().get_image().save_png(directory + "/motion-%04d.png" % frame)
	else:
		var routes = {"right": [Vector2(95, 410), Vector2(290, 410)], "left": [Vector2(290, 410), Vector2(95, 410)], "front": [Vector2(140, 260), Vector2(140, 430)], "back": [Vector2(140, 430), Vector2(140, 260)]}
		for direction in directions:
			var room = load("res://scenes/room.tscn").instantiate()
			root.add_child(room)
			room.configure(GameData.read_json("res://data/interior.json"), pack)
			room.pet.automatic = false
			for tick in 120:
				await physics_frame
				if room.navigation_ready: break
			verify(room.navigation_ready, direction + " navigation ready")
			room.pet.position = routes[direction][0]
			verify(room.pet.go_to(routes[direction][1]), direction + " route accepted")
			var last: Vector2 = room.pet.position
			var max_step := 0.0
			var active_ticks := 0
			var first_step := 0.0
			var last_moving_step := 0.0
			for tick in 1000:
				await physics_frame
				var step := last.distance_to(room.pet.position)
				max_step = maxf(max_step, step)
				if step > 0.0001:
					if first_step == 0.0: first_step = step
					last_moving_step = step
				last = room.pet.position
				if room.pet.state != "walk": break
				if room.pet.facing == direction: active_ticks += 1
			verify(active_ticks > 120, direction + " clip used during movement")
			verify(last.distance_to(routes[direction][1]) < 8, direction + " arrives")
			verify(max_step <= pack.speed / Engine.physics_ticks_per_second + 0.1, direction + " bounded steps")
			verify(first_step > 0.0 and first_step < pack.speed / Engine.physics_ticks_per_second * 0.5, direction + " gradual start")
			verify(last_moving_step < pack.speed / Engine.physics_ticks_per_second * 0.5, direction + " slows before arrival")
			room.queue_free()
			await process_frame
	var report = {"checks": checks, "failures": failures, "recording": "--record" in OS.get_cmdline_user_args() or "--inspect" in OS.get_cmdline_user_args()}
	FileAccess.open(directory + ("/render-report.json" if report.recording else "/physics-report.json"), FileAccess.WRITE).store_string(JSON.stringify(report, "\t"))
	print("FOUR_VIDEO ", JSON.stringify(report))
	quit(0 if failures.is_empty() else 1)
