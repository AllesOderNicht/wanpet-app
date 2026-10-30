extends SceneTree

var app: Control
var errors: Array[String] = []
var evidence: Dictionary = {"checks": [], "captures": [], "soak": []}
var directory := "res://.private/acceptance"
var movie_frame := 0
var user := ""
var secret := ""
var start_time := 0

func _initialize() -> void:
	run.call_deferred()

func verify(value: bool, description: String) -> void:
	evidence.checks.append({"description": description, "passed": value})
	if not value:
		errors.append(description)
		push_error(description)

func wait_seconds(seconds: float) -> void:
	await create_timer(seconds).timeout

func capture(name: String) -> void:
	await RenderingServer.frame_post_draw
	var path = directory + "/" + name + ".png"
	var error = root.get_texture().get_image().save_png(path)
	verify(error == OK, "capture " + name)
	evidence.captures.append(name)

func run() -> void:
	start_time = Time.get_ticks_msec()
	DirAccess.make_dir_recursive_absolute(directory)
	app = load("res://scenes/main.tscn").instantiate()
	root.add_child(app)
	await process_frame
	var credentials_path = "res://.private/acceptance-account.json"
	var stored = GameData.read_json(credentials_path) if FileAccess.file_exists(credentials_path) else {}
	if stored.is_empty():
		user = "godotqa" + str(int(Time.get_unix_time_from_system()))
		secret = Crypto.new().generate_random_bytes(24).hex_encode()
		var file = FileAccess.open(credentials_path, FileAccess.WRITE)
		file.store_string(JSON.stringify({"username": user, "password": secret}))
		file.close()
	else:
		user = stored.username
		secret = stored.password
	var signed_in: bool = await app.session.authenticate(user, secret, stored.is_empty())
	verify(signed_in and not app.session.snapshot.is_empty(), "real auth and initialized account")
	if not signed_in or app.session.snapshot.is_empty():
		finish()
		return
	# Save the actual server identity, not the visual calico resource ID.
	var player_id: String = app.session.snapshot.player.id
	app.automatic = false
	app._open("home")
	await wait_seconds(1)
	verify(is_instance_valid(app.home) and app.home.cat.sprite_frames.get_frame_count("rest") == 121, "selected native home with complete121-frame video cat mounted")
	await capture("home")
	app.home.open_requested.emit("bag")
	await process_frame
	verify(app.current_page == "bag", "home bag hotspot routes to real inventory")
	app._open("home")
	await process_frame
	app.home.courtyard_requested.emit()
	verify(app.current_page == "activity" and app.current_room == "courtyard", "home courtyard hotspot routes to room")
	app._switch_room("interior")
	await wait_seconds(1)
	var room = app.room
	room.pet.go_to(Vector2(255, 280))
	for frame in 80:
		await wait_seconds(0.1)
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(directory + "/motion-%04d.png" % movie_frame)
		movie_frame += 1
	verify(room.pet.position.distance_to(Vector2(255, 280)) < 8, "visible pet reaches destination around furniture")
	await capture("behind-furniture")
	for action in ["sleep", "eat"]:
		var target: Dictionary = room.definition.interactions.filter(func(i): return i.action == action)[0]
		room.pet.go_to(GameData.point(target.position), target)
		var arrived := false
		for frame in 240:
			await wait_seconds(0.1)
			if room.pet.state == action:
				arrived = true
				break
		verify(arrived, action + " reached and animation started")
		await capture(action)
	room.pet.stroke()
	verify(room.pet.state == "pet", "stroke interrupts eating")
	await capture("pet")
	var door: Dictionary = room.definition.interactions.filter(func(i): return i.action == "door")[0]
	room.pet.go_to(GameData.point(door.position), door)
	for frame in 140:
		await wait_seconds(0.1)
		if app.current_room == "courtyard":
			break
	verify(app.current_room == "courtyard", "walking through door switches room")
	await capture("courtyard")
	app.current_page = "settings"
	app._draw_page()
	var settings_content = app.content.get_instance_id()
	await app.session.refresh()
	await process_frame
	verify(app.content.get_instance_id() == settings_content, "time-only server refresh preserves native form controls")
	app._open("bag")
	await process_frame
	await capture("bag")
	if app.session.snapshot.activeTrip != null:
		while app.session.snapshot.activeTrip.status != "READY_TO_CLAIM":
			await wait_seconds(2)
			await app.session.refresh()
		await app.session.claim_trip()
	var previous_revision = app.session.snapshot.revision
	await app.session.start_trip(["test_food"])
	verify(app.session.snapshot.revision == previous_revision + 1 and app.session.snapshot.activeTrip != null, "actual departure confirmed by server")
	app._open("home")
	await process_frame
	verify(not app.home.cat.visible, "server-confirmed departure removes home cat")
	await capture("home-traveling")
	var trip_id = app.session.snapshot.activeTrip.id
	app._open("trip")
	await process_frame
	await capture("traveling")
	var inventory_after_start = app.session.snapshot.inventory.duplicate(true)
	await app.session.start_trip(["test_food"])
	verify(app.session.snapshot.activeTrip.id == trip_id and app.session.snapshot.inventory == inventory_after_start, "repeat start cannot consume twice")
	# Destroy the whole client tree and its in-memory token to exercise restart recovery.
	app.queue_free()
	await process_frame
	app = load("res://scenes/main.tscn").instantiate()
	root.add_child(app)
	verify(app.session.token.is_empty(), "restart has no persisted auth token")
	await app.session.authenticate(user, secret)
	verify(app.session.snapshot.player.id == player_id and app.session.snapshot.activeTrip.id == trip_id, "relogin restores exact player and trip")
	while app.session.snapshot.activeTrip.status != "READY_TO_CLAIM":
		await wait_seconds(2)
		await app.session.refresh()
	verify(app.session.snapshot.pet.status == "AT_HOME", "server arrival restores home pet before claim")
	app._open("home")
	await process_frame
	verify(app.home.cat.visible, "server-confirmed return restores home sprite")
	app._open("trip")
	await process_frame
	await capture("ready-to-claim")
	await app.session.claim_trip()
	verify(app.session.snapshot.activeTrip == null and not app.session.snapshot.collection.is_empty(), "claim updates authoritative inventory and collection")
	await process_frame
	await capture("return")
	app._open("collection")
	await process_frame
	await capture("collection")
	var before_duplicate = app.session.snapshot.duplicate(true)
	var replay = await app.session.request("/me/trips/" + trip_id + "/claim", HTTPClient.METHOD_POST, {}, Crypto.new().generate_random_bytes(12).hex_encode())
	verify(replay.status == 200, "different-key duplicate claim replays on real server")
	await app.session.refresh()
	verify(app.session.snapshot.revision == before_duplicate.revision and app.session.snapshot.inventory == before_duplicate.inventory, "duplicate claim does not add rewards")
	await app.session.logout()
	verify(app.session.token.is_empty(), "real logout clears client session")
	await app.session.authenticate(user, secret)
	verify(app.session.snapshot.collection == before_duplicate.collection, "login restores collected postcards")
	if "--soak" in OS.get_cmdline_user_args():
		await soak()
	finish()

func soak() -> void:
	var began = Time.get_ticks_msec()
	var baseline := 0
	for tick in 90:
		app._open("home")
		await process_frame
		app.automatic = true
		app._switch_room("interior" if tick % 2 == 0 else "courtyard")
		app.room.set_options(true, false)
		app.room.process_mode = Node.PROCESS_MODE_INHERIT
		app.session.set_focused(true)
		await wait_seconds(7)
		app._open(["bag", "trip", "collection", "settings"][tick % 4])
		await process_frame
		await wait_seconds(3)
		if tick == 5:
			baseline = int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT))
		if tick % 6 == 5:
			var sample = {"elapsedSeconds": (Time.get_ticks_msec() - began) / 1000.0, "nodes": int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT)), "objects": int(Performance.get_monitor(Performance.OBJECT_COUNT)), "memoryBytes": int(Performance.get_monitor(Performance.MEMORY_STATIC)), "fps": Performance.get_monitor(Performance.TIME_FPS)}
			evidence.soak.append(sample)
			print("SOAK ", JSON.stringify(sample))
			verify(sample.nodes <= baseline + 80, "bounded node count at soak interval " + str(tick))
	verify(Time.get_ticks_msec() - began >= 900000, "15 actual minutes of scene and page transitions")

func finish() -> void:
	evidence["errors"] = errors
	evidence["elapsedSeconds"] = (Time.get_ticks_msec() - start_time) / 1000.0
	evidence["engine"] = Engine.get_version_info().string
	var file = FileAccess.open(directory + "/report.json", FileAccess.WRITE)
	file.store_string(JSON.stringify(evidence, "\t"))
	file.close()
	print("ACCEPTANCE ", JSON.stringify({"checks": evidence.checks.size(), "errors": errors, "elapsedSeconds": evidence.elapsedSeconds}))
	if is_instance_valid(app):
		app.queue_free()
	await process_frame
	quit(0 if errors.is_empty() else 1)
