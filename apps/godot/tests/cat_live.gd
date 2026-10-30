extends SceneTree
func _initialize() -> void: run.call_deferred()
func run() -> void:
	create_timer(100).timeout.connect(func(): push_error("live cat behavior timed out"); quit(1))
	root.content_scale_size = Vector2i(390, 844)
	root.size = Vector2i(390, 844)
	var args = OS.get_cmdline_user_args()
	assert(args.size() == 2)
	var view = JSON.parse_string(FileAccess.get_file_as_string(args[0]))
	assert(view is Dictionary and view.intent is Dictionary)
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
	scene.take_events()
	assert(scene.dispatch(JSON.stringify({"type":"life","value":view})))
	print("LIVE_CAT: executing " + str(view.intent.activity))
	while true:
		await process_frame
		for event in JSON.parse_string(scene.take_events()):
			if event.get("event") == "blocked" and event.get("intentId") == view.intent.id:
				push_error("live intent destination blocked")
				quit(1)
				return
			if event.get("type") == "life_request" and event.get("event") == "complete" and event.get("intentId") == view.intent.id:
				var file = FileAccess.open(args[1], FileAccess.WRITE)
				file.store_string(JSON.stringify(event))
				file.close()
				print("LIVE_CAT: real server intention reached its spot and completed its full duration")
				quit()
				return
