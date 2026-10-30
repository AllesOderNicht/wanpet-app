extends SceneTree
func _initialize() -> void: run.call_deferred()
func value_for(id: String, action: String, spot: String, surface := "interior") -> Dictionary:
	return {"needs":{"hunger":0.2,"fatigue":0.2,"stimulation":0.4,"alertness":0.1},"cushion":"shelter","serverNow":"2026-10-29T00:00:00Z","intent":{"id":id,"activity":action,"spot":spot,"surface":surface,"durationSeconds":30,"protocolVersion":2,"stage":"moving","startedAt":"2026-10-29T00:00:00Z"}}
func run() -> void:
	create_timer(180).timeout.connect(func(): push_error("cat life acceptance timed out"); quit(1))
	root.content_scale_size = Vector2i(390, 844)
	root.size = Vector2i(390, 844)
	var scene = load("res://scenes/rn_scene.tscn").instantiate()
	root.add_child(scene)
	await process_frame
	scene.size = Vector2(390, 844)
	scene._fit()
	var room = scene.rooms.interior
	for frame in 120:
		await physics_frame
		if room.navigation_ready: break
	assert(room.navigation_ready)
	var life = room.life
	assert(not room.pet.automatic, "server intention controller owns automatic decisions")
	var n := 0
	for action in ["sleep", "eat", "drink", "toilet", "read", "watch", "sniff", "rest", "approach", "retreat"]:
		n += 1
		var spot: String = {"sleep":"shelter","eat":"food","drink":"water","toilet":"toilet","read":"reading","watch":"sunny","sniff":"sunny","rest":"shelter","approach":"nearby","retreat":"shelter"}[action]
		var id := "00000000-0000-0000-0000-%012d" % n
		var value = value_for(id, action, spot)
		assert(scene.dispatch(JSON.stringify({"type":"life","value":value})))
		for frame in 1500:
			await physics_frame
			if life.arrived: break
		assert(life.arrived, "reachable " + action)
		var moved: Array = JSON.parse_string(scene.take_events())
		assert(moved.filter(func(e): return e.get("event") == "started" and e.get("intentId") == id).size() == 1)
		assert(moved.any(func(e): return e.get("event") == "arrived" and e.get("intentId") == id))
		assert(room.pet.position.distance_to(GameData.point(life.slot.position)) < 8)
		assert(room.pet.state == "idle", "wait for server arrival before acting")
		life._process(31)
		assert(life.held == 0, "movement/wait time never completes use")
		scene.take_events()
		value.intent.stage = "using"
		value.intent.usingAt = "2026-10-29T00:00:00Z"
		assert(scene.dispatch(JSON.stringify({"type":"life","value":value})))
		assert(life.use_confirmed)
		assert(room.pet.visible == (action != "toilet"), "private toilet and visible other activities")
		life.held = 5
		var pose_frame = room.pet.sprite.sprite_frames.get_frame_count(room.pet.sprite.animation) - 1
		room.pet.sprite.set_frame_and_progress(pose_frame, 0)
		assert(scene.dispatch(JSON.stringify({"type":"life","value":value})))
		assert(life.held == 5, "same receipt does not restart use")
		assert(room.pet.sprite.frame == pose_frame, "repeated receipt does not restart animation")
		if action in ["eat", "drink"]:
			assert((room.pet.position + room.pet.contact_offset("eat")).distance_to(GameData.point(life.slot.contact)) < 8, "nose reaches bowl contact")
		if "--render" in OS.get_cmdline_user_args():
			DirAccess.make_dir_recursive_absolute("res://.private/living-v2")
			for frame in 8: await physics_frame
			await RenderingServer.frame_post_draw
			root.get_texture().get_image().save_png("res://.private/living-v2/" + action + ".png")
		life.held = 29.99
		life._process(0.02)
		life._process(0.02)
		var events: Array = JSON.parse_string(scene.take_events())
		assert(events.filter(func(e): return e.get("event") == "complete" and e.get("intentId") == id).size() == 1)
		assert(life.needs.hunger == 0.2, "presentation never fabricates nutrition")
		if action == "read":
			# Simulate a stale completion receipt at 29.4s of server use time.
			value.serverNow = "2026-10-29T00:00:30.100Z"
			value.intent.usingAt = "2026-10-29T00:00:00.700Z"
			assert(scene.dispatch(JSON.stringify({"type":"life","value":value})))
			assert(not life.reported and absf(life.held - 29.4) < 0.01)
			life._process(0.7)
			var retried: Array = JSON.parse_string(scene.take_events())
			assert(retried.any(func(e): return e.get("event") == "complete"), "early completion retries after authoritative time")
	# A cleared server intent restores visibility and stops obsolete movement.
	var cleared = value_for("00000000-0000-0000-0000-000000000090", "rest", "shelter")
	cleared.intent = null
	assert(scene.dispatch(JSON.stringify({"type":"life","value":cleared})))
	assert(life.intent.is_empty() and room.pet.visible and room.pet.state == "rest")
	room.navigation_ready = false
	var delayed = value_for("00000000-0000-0000-0000-000000000089", "read", "reading")
	assert(scene.dispatch(JSON.stringify({"type":"life","value":delayed})))
	assert(not life.deferred_intent.is_empty())
	assert(scene.dispatch(JSON.stringify({"type":"life","value":cleared})))
	room.navigation_ready = true
	life._process(0.1)
	assert(life.deferred_intent.is_empty() and life.intent.is_empty(), "cancelled pre-navigation intent cannot return")
	# Reduced motion still executes a valid activity and reports its outcome.
	scene.dispatch('{"type":"state","available":true,"automatic":true,"reduced":true}')
	var quiet = value_for("00000000-0000-0000-0000-000000000091", "read", "reading")
	assert(scene.dispatch(JSON.stringify({"type":"life","value":quiet})))
	life._process(0.1)
	assert(life.arrived)
	quiet.intent.stage = "using"
	quiet.intent.usingAt = "2026-10-29T00:00:00Z"
	assert(scene.dispatch(JSON.stringify({"type":"life","value":quiet})))
	assert(room.pet.state == "read" and room.pet.sprite.speed_scale == 0)
	life.held = 30
	life._process(0.1)
	assert(life.reported)
	scene.dispatch('{"type":"state","available":false,"automatic":true,"reduced":false}')
	assert(not room.pet.visible and life.intent.is_empty())
	assert(not scene.dispatch('{"type":"life","value":{"needs":{},"cushion":"shelter","intent":{"activity":"fly"}}}'))
	scene.dispatch('{"type":"state","available":true,"automatic":true,"reduced":false}')
	scene.dispatch('{"type":"surface","value":"courtyard"}')
	room = scene.rooms.courtyard
	life = room.life
	for frame in 120:
		await physics_frame
		if room.navigation_ready: break
	for spot in ["sunny", "shelter", "food", "water", "toilet", "reading", "nearby"]:
		var destination = GameData.point(room.life_slot(spot).position)
		var route = room.path_to(room.pet.position, destination)
		assert(not route.is_empty() and route[-1].distance_to(destination) < 12, "courtyard " + spot)
	life.waiting = 12
	life._process(0.01)
	assert(str(life.intent.get("id")).begins_with("local-"))
	assert(life.intent.activity in ["rest", "watch"], "offline only shows nonconsumptive behavior")
	scene.take_events()
	life._report("complete")
	var local_events: Array = JSON.parse_string(scene.take_events())
	assert(not local_events.any(func(e): return e.get("event") == "complete"))
	print("CAT_LIFE_V2: 10 indoor paths, server arrival gate, contact anchors, privacy, exact-once completion, reduced motion and courtyard/offline behavior passed")
	scene.queue_free()
	await process_frame
	await physics_frame
	quit()
