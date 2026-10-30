extends SceneTree

var failures: Array[String] = []
var checks := 0
var directory := "res://.private/walk24"

func _initialize() -> void:
	run.call_deferred()

func verify(value: bool, label: String) -> void:
	checks += 1
	if not value:
		failures.append(label)
		push_error(label)

func run() -> void:
	root.content_scale_size = Vector2i(640, 680)
	root.size = Vector2i(640, 680)
	DirAccess.make_dir_recursive_absolute(directory)
	var pack = GameData.read_json("res://data/pet.json")
	verify(GameData.validate_pet(pack).is_empty(), "new walk pack validates")
	var stage := Node2D.new()
	root.add_child(stage)
	var pets: Array[HomePet] = []
	var directions = ["front", "back", "left", "right"]
	for index in 4:
		var pet := HomePet.new()
		stage.add_child(pet)
		var visual_pack = pack.duplicate(true)
		visual_pack.scale = 0.34
		pet.configure(visual_pack, stage)
		pet.position = Vector2(165 + index % 2 * 310, 275 + index / 2 * 300)
		pet.facing = directions[index]
		pet._set_state("walk")
		verify(pet.sprite.sprite_frames.get_frame_count("walk_" + directions[index]) == 121, directions[index] + " has121frames")
		verify(pet.sprite.material == null, directions[index] + " has no warp material")
		pet.sprite.pause()
		pets.append(pet)
		var label := Label.new()
		label.text = directions[index]
		label.position = pet.position + Vector2(-25, 24)
		label.add_theme_color_override("font_color", Color("#34433a"))
		stage.add_child(label)
	for frame in 180:
		for pet in pets:
			pet.sprite.set_frame_and_progress(int(frame * 24.0 / 30.0) % 121, 0.0)
		await RenderingServer.frame_post_draw
		if "--record" in OS.get_cmdline_user_args():
			root.get_texture().get_image().save_png(directory + "/motion-%04d.png" % frame)
		if frame in [0, 10, 20]:
			root.get_texture().get_image().save_png(directory + "/poses-%03d.png" % frame)
	stage.queue_free()
	await process_frame
	for id in ["interior", "courtyard"]:
		var room = load("res://scenes/room.tscn").instantiate()
		root.add_child(room)
		room.position = Vector2(125, 40)
		room.configure(GameData.read_json("res://data/" + id + ".json"), pack)
		room.pet.automatic = false
		for frame in 120:
			await physics_frame
			if room.navigation_ready: break
		verify(room.navigation_ready, id + " navigation ready")
		var target = Vector2(255, 280) if id == "interior" else Vector2(270, 300)
		verify(room.pet.go_to(target), id + " destination accepted")
		var maximum_step := 0.0
		var last: Vector2 = room.pet.position
		var sampled: Array = []
		var intervals: Array[float] = []
		var previous_tick := Time.get_ticks_usec()
		for tick in 900:
			await physics_frame
			var now := Time.get_ticks_usec()
			intervals.append((now - previous_tick) / 1000.0)
			previous_tick = now
			maximum_step = maxf(maximum_step, last.distance_to(room.pet.position))
			last = room.pet.position
			if tick % 30 == 0:
				sampled.append({"position": [last.x, last.y], "facing": room.pet.facing, "frame": room.pet.sprite.frame, "speedScale": room.pet.sprite.speed_scale})
			if room.pet.state != "walk": break
		verify(room.pet.position.distance_to(target) < 8, id + " reaches target without timeout")
		verify(maximum_step <= pack.speed / Engine.physics_ticks_per_second + 0.1, id + " movement has no position jumps")
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(directory + "/" + id + ".png")
		var trace = FileAccess.open(directory + "/" + id + ".json", FileAccess.WRITE)
		intervals.sort()
		var timing = {"samples": intervals.size(), "medianMs": intervals[intervals.size() / 2], "p95Ms": intervals[int(intervals.size() * 0.95)], "maxMs": intervals[-1]}
		trace.store_string(JSON.stringify({"maximumStep": maximum_step, "physicsWallIntervals": timing, "samples": sampled}, "\t"))
		print(id, " physics wall timing: ", JSON.stringify(timing))
		room.queue_free()
		await process_frame
	var report = {"checks": checks, "failures": failures}
	FileAccess.open(directory + "/report.json", FileAccess.WRITE).store_string(JSON.stringify(report, "\t"))
	print("WALK24 ", JSON.stringify(report))
	quit(0 if failures.is_empty() else 1)
