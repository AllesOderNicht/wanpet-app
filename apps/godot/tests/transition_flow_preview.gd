extends SceneTree
func _initialize() -> void: run.call_deferred()
func run() -> void:
	root.content_scale_size = Vector2i(390, 560)
	root.size = Vector2i(390, 560)
	var directory := "res://.private/transition-flow"
	DirAccess.make_dir_recursive_absolute(directory)
	var room = load("res://scenes/room.tscn").instantiate()
	root.add_child(room)
	room.configure(GameData.read_json("res://data/interior.json"), GameData.read_json("res://data/pet.json"))
	room.pet.automatic = false
	for tick in 120:
		await physics_frame
		if room.navigation_ready: break
	var pet: HomePet = room.pet
	pet.set_physics_process(false)
	pet.position = Vector2(82, 297)
	pet.stroke()
	var label := Label.new()
	label.position = Vector2(16, 16)
	label.add_theme_color_override("font_color", Color("#34433a"))
	root.add_child(label)
	var output := 0
	for action in ["lie_down", "pet", "rise"]:
		assert(pet.state == action)
		label.text = {"lie_down":"慢慢趴下", "pet":"享受抚摸", "rise":"起身，准备散步"}[action]
		pet.sprite.pause()
		for frame in 121:
			pet.sprite.set_frame_and_progress(frame, 0.0)
			await RenderingServer.frame_post_draw
			root.get_texture().get_image().save_png(directory + "/motion-%04d.png" % output)
			output += 1
		pet.activity_time = 121.0 / 24.0
		pet._physics_process(0.001)
		if action == "pet":
			assert(pet.state == "rest")
			assert(pet.go_to(Vector2(290, 410)))
	assert(pet.state == "walk")
	print("TRANSITION_FLOW: deterministic native pose flow rendered363frames; public stroke and go_to lead to walk")
	quit()
