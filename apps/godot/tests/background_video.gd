extends SceneTree

var failures: Array[String] = []
var captures := ""

func _initialize() -> void: run.call_deferred()

func check(ok: bool, label: String) -> void:
	if not ok:
		failures.append(label)
		push_error(label)

func capture(label: String) -> void:
	if captures.is_empty(): return
	await process_frame
	RenderingServer.force_draw(false)
	check(root.get_texture().get_image().save_png(captures.path_join(label + ".png")) == OK, "save " + label)

func run() -> void:
	create_timer(25).timeout.connect(func(): push_error("background video test timed out"); quit(1))
	var args = OS.get_cmdline_user_args()
	if not args.is_empty():
		captures = args[0]
		DirAccess.make_dir_recursive_absolute(captures)
	root.content_scale_size = Vector2i(390, 844)
	root.size = Vector2i(390, 844)
	var scene = load("res://scenes/rn_scene.tscn").instantiate()
	root.add_child(scene)
	await process_frame
	scene.size = Vector2(390, 844)
	scene._fit()
	var room = scene.rooms.interior
	var video: VideoStreamPlayer = room.background_video
	if video == null:
		push_error("interior must use the generated background video")
		quit(1)
		return
	check(video.is_playing() and video.loop and not video.paused, "video starts looping")
	check(video.volume == 0 and video.mouse_filter == Control.MOUSE_FILTER_IGNORE, "background is silent and cannot intercept touches")
	check(video.size == video.get_parent().texture.get_size(), "video shares the poster's logical dimensions")
	await create_timer(0.25).timeout
	print("BACKGROUND_VIDEO: started; first playback position=" + str(video.stream_position))
	await capture("room-start")
	var initial = video.get_video_texture().get_image().get_data()
	await create_timer(1.75).timeout
	check(video.get_video_texture().get_image().get_data() != initial, "actual decoded video frames change")
	await capture("room-sway")
	var wrapped := false
	var previous := video.stream_position
	for sample in 55:
		await create_timer(0.1).timeout
		if video.stream_position < previous: wrapped = true
		previous = video.stream_position
	check(wrapped and video.is_playing(), "playback crosses the loop boundary and continues")
	await capture("room-loop")
	scene.dispatch('{"type":"state","available":true,"automatic":false,"reduced":true}')
	check(video.paused and not video.visible, "reduced motion shows the original still")
	var stopped := video.stream_position
	await create_timer(0.25).timeout
	check(absf(video.stream_position - stopped) < 0.05, "reduced motion stops decoding progression")
	await capture("room-reduced")
	scene.dispatch('{"type":"state","available":true,"automatic":false,"reduced":false}')
	check(not video.paused and video.visible, "motion resumes")
	scene.dispatch('{"type":"surface","value":"courtyard"}')
	check(video.paused, "hidden room pauses video")
	stopped = video.stream_position
	await create_timer(0.25).timeout
	check(absf(video.stream_position - stopped) < 0.05, "hidden room does not advance video")
	scene.dispatch('{"type":"surface","value":"home"}')
	await process_frame
	check(scene.rooms.interior == room and not video.paused, "returning reuses and resumes the room")
	paused = true
	check(video.paused, "pausing the scene pauses video")
	await create_timer(0.2).timeout
	paused = false
	await process_frame
	check(not video.paused, "resuming the scene resumes video")
	scene.take_events()
	room.interact_at(room.pet.position + room.pet.hit_rect().get_center())
	var events = JSON.parse_string(scene.take_events())
	check(events.any(func(e): return e.get("type") == "life_request" and e.get("event") == "stroke"), "cat still receives foreground interaction")
	check(room.navigation_ready and not room.path_to(room.pet.position, Vector2(215, 634)).is_empty(), "cat navigation remains available")
	scene.size = Vector2(430, 932)
	scene._fit()
	check(is_equal_approx(room.scale.x, room.scale.y), "room remains uniformly scaled")
	print("BACKGROUND_VIDEO: " + ("passed real decoding, loop, still fallback, visibility/pause, touch and navigation" if failures.is_empty() else str(failures)))
	scene.queue_free()
	await process_frame
	quit(0 if failures.is_empty() else 1)
