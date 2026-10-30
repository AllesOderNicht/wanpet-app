extends SceneTree

var scene: Control
var room: HomeRoom
var output := ""
var recording := false
var recorded := 0
var record_time := 0.0

func _initialize() -> void:
	run.call_deferred()

func _process(delta: float) -> bool:
	if recording:
		record_time += delta
		if record_time >= 0.1:
			record_time -= 0.1
			root.get_texture().get_image().save_png(output + "/motion-%04d.png" % recorded)
			recorded += 1
	return false

func capture(name: String) -> void:
	if output.is_empty(): return
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(output + "/" + name + ".png")

func wait_for_seat() -> void:
	for frame in 1200:
		await physics_frame
		if room.pet.state == "read" and not room.pet.seat_transition: return
	assert(false, "reading chair must be reachable")

func run() -> void:
	if "--interactive" not in OS.get_cmdline_user_args():
		create_timer(90).timeout.connect(func(): push_error("loft acceptance timed out"); quit(1))
	output = OS.get_environment("WANPET_LOFT_CAPTURE_DIR")
	if not output.is_empty(): DirAccess.make_dir_recursive_absolute(output)
	root.content_scale_size = Vector2i(390, 844)
	root.size = Vector2i(390, 844)
	scene = load("res://scenes/rn_scene.tscn").instantiate()
	root.add_child(scene)
	scene.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	await process_frame
	room = scene.rooms.interior
	room.life.set_options(false, false)
	for frame in 120:
		await physics_frame
		if room.navigation_ready: break
	assert(room.navigation_ready)
	assert(GameData.validate_room(room.definition, ["interior", "courtyard"]).is_empty())
	var invalid: Dictionary = room.definition.duplicate(true)
	invalid.reading_pose.frames[0].foreground = [0, 0, 9999, 9999]
	assert(not GameData.validate_room(invalid, ["interior", "courtyard"]).is_empty())
	invalid = room.definition.duplicate(true)
	invalid.reading_pose.frames[0].duration = 0
	assert(not GameData.validate_room(invalid, ["interior", "courtyard"]).is_empty())
	scene.take_events()
	room.interact_at(Vector2(180, 570))
	var invitations: Array = JSON.parse_string(scene.take_events())
	assert(invitations.any(func(e): return e.get("invitedActivity") == "read" and e.get("event") == "invite"))
	assert(room.pet.state != "read", "a table tap invites; it cannot authorize a server activity")
	var destination := GameData.point(room.life_slot("reading").position)
	assert(room.pet.go_to(destination, {"action": "read", "facing": "left"}, false))
	recording = "--record" in OS.get_cmdline_user_args() and not output.is_empty()
	await wait_for_seat()
	assert(room.pet.position.distance_to(destination) < 8)
	assert(room.pet.pose_front.visible, "paws render above the table")
	assert(room.pet.sprite.position == Vector2.ZERO)
	room.life.touch()
	assert(room.pet.state == "read" and not room.pet.seat_transition, "petting cannot drop a seated cat onto the floor")
	room.pet.sprite.set_frame_and_progress(0, 0)
	room.pet.sprite.pause()
	await capture("phone-sit")
	if recording:
		room.pet.sprite.play("read")
		await create_timer(6.4).timeout
	room.pet.sprite.pause()
	room.pet.sprite.set_frame_and_progress(1, 0)
	await capture("phone-blink")
	room.pet.sprite.set_frame_and_progress(3, 0)
	await capture("phone-lowering")
	room.pet.sprite.set_frame_and_progress(4, 0)
	await capture("phone-lean")
	if recording: await create_timer(2.5).timeout
	root.size = Vector2i(430, 932)
	scene.size = Vector2(430, 932)
	scene._fit()
	await capture("large-phone-lean")
	root.size = Vector2i(390, 844)
	scene.size = Vector2(390, 844)
	scene._fit()
	assert(room.pet.go_to(Vector2(205, 698), {}, false))
	assert(room.pet.seat_transition and room.pet.state == "read", "step down before walking")
	await create_timer(0.42).timeout
	await capture("phone-exit")
	for frame in 30:
		await physics_frame
		if room.pet.state == "walk": break
	assert(room.pet.state == "walk")
	assert(room.pet.pose_ghost.position == room.pet._seat_offset(), "outgoing pose stays at the descended position during crossfade")
	await capture("phone-handoff")
	for frame in 900:
		await physics_frame
		if room.pet.state != "walk" and not room.pet.seat_transition: break
	assert(not room.pet.pose_front.visible and room.pet.sprite.position == Vector2.ZERO)
	assert(room.pet.position.distance_to(Vector2(205, 698)) < 12)
	await create_timer(0.18).timeout
	await capture("phone-away")
	recording = false
	# Leaving during an entry tween and travel cancellation must not strand the pet.
	room.pet.position = destination
	room.pet._begin_life("read")
	assert(room.pet.seat_transition)
	room.pet.set_available(false)
	assert(not room.pet.seat_transition and not room.pet.visible)
	await create_timer(0.6).timeout
	assert(room.pet.state == "rest")
	room.pet.set_available(true)
	room.set_options(false, true)
	room.pet._begin_life("read")
	assert(not room.pet.seat_transition and room.pet.sprite.speed_scale == 0)
	assert(room.pet.go_to(Vector2(205, 698), {}, false))
	assert(room.pet.state == "walk" and not room.pet.seat_transition)
	print("LOFT_TABLE: reachable seat, invitation authority, authored paw occlusion, sit/lean, step-down, cancellation, reduced motion and frame validation passed")
	if "--interactive" in OS.get_cmdline_user_args():
		room.set_options(false, false)
		show_controls()
		return
	scene.queue_free()
	await process_frame
	await physics_frame
	quit()

func show_controls() -> void:
	root.title = "丸宠 · 阁楼桌边动作试玩"
	var layer := CanvasLayer.new()
	root.add_child(layer)
	var row := HBoxContainer.new()
	row.position = Vector2(35, 775)
	row.add_theme_constant_override("separation", 10)
	layer.add_child(row)
	for caption in ["坐一会儿", "趴在桌边", "下来走走"]:
		var button := Button.new()
		button.text = caption
		button.custom_minimum_size = Vector2(100, 44)
		row.add_child(button)
		button.pressed.connect(func():
			if caption == "下来走走":
				room.pet.go_to(Vector2(205, 698), {}, false)
			else:
				room.pet.go_to(GameData.point(room.life_slot("reading").position), {"action": "read"}, false)
				await wait_for_seat()
				room.pet.sprite.set_frame_and_progress(4 if caption == "趴在桌边" else 0, 0)
				room.pet.sprite.pause()
		)
