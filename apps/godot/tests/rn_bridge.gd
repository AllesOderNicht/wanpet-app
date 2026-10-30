extends SceneTree
func _initialize() -> void: run.call_deferred()
func run() -> void:
	var scene = load("res://scenes/rn_scene.tscn").instantiate()
	root.add_child(scene)
	await process_frame
	assert(scene.rooms.has("interior"), "home is the interactive room")
	var original = scene.rooms.interior
	var room_data = GameData.read_json("res://data/morning-interior.json")
	assert(GameData.validate_room(room_data, ["interior", "courtyard"]).is_empty())
	for invalid_video in ["https://example.com/room.ogv", "res://assets/../room.ogv", "res://assets/morning/room.mp4", "res://assets/morning/missing.ogv", 123]:
		var invalid_room = room_data.duplicate(true)
		invalid_room.background_video = invalid_video
		assert(not GameData.validate_room(invalid_room, ["interior", "courtyard"]).is_empty(), "unsupported or missing background video must be rejected")
	assert(original.pet.state == "rest")
	assert(original.pet.sprite.animation == "rest")
	assert(original.pet.sprite.sprite_frames.get_frame_count("rest") == 121)
	assert(not scene.dispatch('{"type":"state","available":"yes"}'))
	assert(scene.dispatch('{"type":"state","available":false,"automatic":false,"reduced":true}'))
	assert(not original.pet.visible)
	assert(scene.dispatch('{"type":"surface","value":"courtyard"}'))
	assert(scene.rooms.courtyard.region.get_navigation_map() != original.region.get_navigation_map())
	assert(scene.dispatch('{"type":"surface","value":"home"}'))
	assert(scene.rooms.interior == original, "sheet/room navigation preserves instance")
	assert(scene.dispatch('{"type":"state","available":true,"automatic":false,"reduced":false}'))
	assert(original.pet.available and original.pet.state == "rest")
	# Frame anchors are the sole contact-point authority; each action uses a fixed scale.
	var pet = original.pet
	for direction in ["front", "back", "left", "right"]:
		pet.facing = direction
		pet._set_state("walk")
		var first_scale = pet.sprite.scale
		for frame in pet.sprite.sprite_frames.get_frame_count(pet.sprite.animation):
			pet.sprite.set_frame_and_progress(frame, 0)
			assert(pet.sprite.scale.is_equal_approx(first_scale), "no per-frame stretching")
		var box = pet.hit_rect()
		assert(box.size.x < 245 and box.size.y < 190, "walk must fit furniture scale")
	pet._set_state("rest")
	pet.queued_walk = true
	pet._start_transition("rise")
	assert(pet.state == "walk", "incompatible morph clip cannot resize the body")
	scene.size = Vector2(430, 932)
	scene._fit()
	assert(original.scale.x == original.scale.y)
	assert(original.scale.x >= 430.0 / 390.0)
	assert(JSON.parse_string(scene.take_events()).size() > 0)
	assert(scene.take_events() == "[]")
	print("RN_BRIDGE: live home, scene reuse, separate navigation maps, 121-frame rest, fixed walk proportions and full-screen fit passed")
	scene.queue_free()
	await process_frame
	await physics_frame
	quit()
