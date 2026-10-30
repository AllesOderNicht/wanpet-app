extends SceneTree

var failures: Array[String] = []
var count := 0

class FakeSession extends GameSession:
	var replies: Array = []
	var sent: Array = []
	func request(path: String, method: HTTPClient.Method = HTTPClient.METHOD_GET, body: Variant = null, key: String = "", authenticated: bool = true) -> Dictionary:
		sent.append({"path": path, "method": method, "body": body, "key": key, "authenticated": authenticated})
		if replies.is_empty():
			return {"status": 0, "code": "NETWORK"}
		return replies.pop_front()

class DelayedSession extends GameSession:
	signal release_reply
	var response: Dictionary
	func request(_path: String, _method: HTTPClient.Method = HTTPClient.METHOD_GET, _body: Variant = null, _key: String = "", _authenticated: bool = true) -> Dictionary:
		await release_reply
		return response

func _initialize() -> void:
	run.call_deferred()

func check(condition: bool, label: String) -> void:
	count += 1
	if not condition:
		failures.append(label)
		push_error("FAIL: " + label)

func sample_snapshot(revision: int = 1, now: String = "2026-10-17T09:00:00.000Z") -> Dictionary:
	return {
		"player": {"id": "player-a", "username": "tester"},
		"configVersion": "starter-v1", "pet": {"id": "pet-a", "nickname": "测试宠物", "speciesId": "test_species", "status": "AT_HOME"},
		"inventory": [{"itemId": "test_food", "quantity": 3}], "collection": [], "activeTrip": null,
		"revision": revision, "serverNow": now,
	}

func run() -> void:
	check(load("res://scenes/main.tscn") != null, "main scene and scripts load")
	var pack = GameData.read_json("res://data/pet.json")
	check(GameData.validate_pet(pack).is_empty(), "all four directions and life clips exist")
	for direction in GameData.DIRECTIONS:
		check(pack.clips["walk_" + direction].frames.size() == 121, direction + " walk retains all121 video frames")
	for action in ["sleep", "eat", "pet"]:
		check(pack.clips[action].frames.size() == 121 and pack.clips[action].fps == 24, action + " retains complete24fps video")
	var cycle_room := Node2D.new()
	root.add_child(cycle_room)
	var mixed = pack.duplicate(true)
	mixed.clips.walk_right.frames = []
	for i in 121:
		mixed.clips.walk_right.frames.append(pack.clips.walk_right.frames[i % 24])
	mixed.clips.walk_right.stride_frames = 40
	mixed.clips.walk_front.frames = mixed.clips.walk_front.frames.slice(0, 24)
	mixed.clips.walk_front.stride_frames = 24
	var cycle_pet := HomePet.new()
	cycle_room.add_child(cycle_pet)
	cycle_pet.configure(mixed, cycle_room)
	cycle_pet.facing = "right"
	cycle_pet._set_state("walk")
	cycle_pet.sprite.set_frame_and_progress(50, 0.0)
	cycle_pet.facing = "front"
	cycle_pet._play_pose()
	check(cycle_pet.sprite.frame == 6, "121-frame multi-cycle video turns at matching 24-frame stride phase")
	cycle_pet.facing = "right"
	cycle_pet._play_pose()
	check(cycle_pet.sprite.frame == 10, "turning back preserves quarter-stride phase")
	mixed.clips.walk_right.stride_frames = 0
	check(not GameData.validate_pet(mixed).is_empty(), "zero stride length rejected")
	mixed.clips.walk_right.stride_frames = 40
	mixed.clips.walk_right.ground_speed = 0
	check(not GameData.validate_pet(mixed).is_empty(), "zero ground-contact speed rejected")
	cycle_room.queue_free()
	await process_frame
	var invalid_scale = pack.duplicate(true)
	invalid_scale.clips.walk_front.scale = -1
	check(not GameData.validate_pet(invalid_scale).is_empty(), "negative clip pixel density rejected")
	var broken = pack.duplicate(true)
	broken.clips.erase("walk_back")
	check(not GameData.validate_pet(broken).is_empty(), "missing direction rejected")
	broken = pack.duplicate(true)
	var atlas_width: int = GameData.texture(broken.clips.walk_front.frames[0].texture).get_width()
	broken.clips.walk_front.frames[0].rect = [atlas_width - 1, 0, 2, 2]
	check(not GameData.validate_pet(broken).is_empty(), "out of atlas frame rejected")
	check(not GameData.local_asset("res://assets/../secrets.png"), "asset traversal rejected")
	check(not GameData.local_asset("https://example.com/cat.png"), "remote texture rejected")
	var current = sample_snapshot(3)
	check(Wire.snapshot(current), "contract snapshot accepted")
	check(not Wire.accepts(current, sample_snapshot(2)), "older revision cannot overwrite")
	var due = sample_snapshot(3, "2026-10-17T09:01:00.000Z")
	check(Wire.accepts(current, due), "equal revision accepts newer server time")
	check(not Wire.accepts(due, current), "frozen earlier same-revision receipt rejected")
	var other = current.duplicate(true)
	other.player.id = "player-b"
	check(not Wire.accepts(current, other), "cross-player snapshot rejected")
	other = current.duplicate(true)
	other.inventory[0].quantity = -1
	check(not Wire.snapshot(other), "negative inventory response rejected")
	await _session_checks()
	var app = load("res://scenes/main.tscn").instantiate()
	root.add_child(app)
	app.session.set_process(false)
	app.session.token = "test-memory-only"
	app.session.account = {"id": "ui-fixture", "username": "ui-fixture"}
	app.session.snapshot = sample_snapshot()
	app.session.online = true
	app.current_page = "home"
	app._draw_page()
	check(is_instance_valid(app.home) and app.home.cat.sprite_frames.get_frame_count("rest") == 121, "main home mounts all 121 video frames")
	check(app.home.cat.material == null, "home cat uses sprite frames, no deformation shader")
	app.home.open_requested.emit("bag")
	await process_frame
	check(app.current_page == "bag" and app.content.get_child_count() > 0, "home bag entrance reaches native inventory")
	app._open("home")
	await process_frame
	app.home.courtyard_requested.emit()
	check(app.current_page == "activity" and app.current_room == "courtyard" and is_instance_valid(app.room), "home courtyard entrance reaches navigable room")
	app._open("home")
	await process_frame
	app.session.snapshot.pet.status = "TRAVELING"
	app._draw_page()
	check(not app.home.cat.visible and not app.home.cat.is_playing(), "server traveling state removes home cat")
	app.session.snapshot.pet.status = "AT_HOME"
	app._draw_page()
	check(app.home.cat.visible, "server at-home state restores home cat")
	app._notification(Node.NOTIFICATION_APPLICATION_FOCUS_OUT)
	check(app.home.process_mode == Node.PROCESS_MODE_DISABLED, "backgrounded home pauses animation")
	app._notification(Node.NOTIFICATION_APPLICATION_FOCUS_IN)
	check(app.home.process_mode == Node.PROCESS_MODE_INHERIT, "foregrounded home resumes animation")
	for page in ["bag", "trip", "collection", "settings", "return"]:
		app.current_page = page
		app._draw_page()
		check(app.content.get_child_count() > 0, page + " native UI constructs")
	app.current_page = "settings"
	app._draw_page()
	var form_id = app.content.get_instance_id()
	app.session.snapshot.serverNow = "2026-10-17T09:01:00.000Z"
	app._session_changed()
	await process_frame
	check(app.content.get_instance_id() == form_id, "time-only polling preserves form and focus")
	app.queue_free()
	await process_frame
	for id in ["interior", "courtyard"]:
		var definition = GameData.read_json("res://data/" + id + ".json")
		check(GameData.validate_room(definition, ["interior", "courtyard"]).is_empty(), id + " room schema")
		var room = load("res://scenes/room.tscn").instantiate()
		root.add_child(room)
		room.configure(definition, pack)
		room.pet.facing = "right"
		check(room.pet._facing_for(Vector2(10, 10.5)) == "right", "diagonal noise retains walking axis")
		check(room.pet._facing_for(Vector2(10, 14)) == "front", "clear turn changes walking axis")
		room.pet.state = "walk"
		room.pet._play_pose()
		room.pet.sprite.set_frame_and_progress(3, 0.4)
		room.pet.facing = "front"
		room.pet._play_pose()
		var expected_phase: float = 3.4 / pack.clips.walk_right.stride_frames * pack.clips.walk_front.stride_frames
		check(room.pet.sprite.frame == int(expected_phase) and is_equal_approx(room.pet.sprite.frame_progress, fposmod(expected_phase, 1.0)), "walk turn preserves stride phase across cycle lengths")
		room.pet._set_state("idle")
		for frame in 121:
			await physics_frame
			if room.navigation_ready:
				break
		check(room.navigation_ready, id + " navigation synchronized")
		check(room.world.y_sort_enabled, id + " world uses foot Y order")
		for target in definition.interactions:
			var point = GameData.point(target.position)
			var route: PackedVector2Array = room.path_to(room.pet.position, point)
			check(not route.is_empty() and route[-1].distance_to(point) < 5, id + " reaches " + target.id)
		var start = Vector2(205, 410) if id == "interior" else Vector2(270, 430)
		var end = Vector2(205, 290) if id == "interior" else Vector2(270, 300)
		var route: PackedVector2Array = room.path_to(start, end)
		check(route.size() >= 3, id + " path detours around furniture")
		var safe := true
		for i in range(1, route.size()):
			for step in 30:
				var point = route[i - 1].lerp(route[i], step / 29.0)
				for object in definition.objects:
					if object.has("collision") and Geometry2D.is_point_in_polygon(point - GameData.point(object.position), GameData.polygon(object.collision)):
						safe = false
		check(safe, id + " path segments avoid actual collision footprint")
		room.pet.automatic = false
		room.pet.go_to(GameData.point(definition.interactions[0].position), definition.interactions[0])
		check(room.pet.state == "walk", id + " interaction walks to target first")
		room.pet.stroke()
		check(room.pet.state == "lie_down" and room.pet.next_life == "pet" and not room.pet.queued_walk and room.pet.after_arrival.is_empty(), id + " stroke cancels old intent and schedules pet after lying down")
		room.pet.set_available(false)
		check(not room.pet.visible and not room.pet.go_to(Vector2(200, 450)), id + " traveling pet cannot interact")
		room.queue_free()
		await process_frame
	var report = {"checks": count, "failures": failures, "engine": Engine.get_version_info().string}
	var file = FileAccess.open("res://.private/check-results.json", FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(report, "\t"))
		file.close()
	print(JSON.stringify(report))
	quit(0 if failures.is_empty() else 1)

func _session_checks() -> void:
	var session = FakeSession.new()
	root.add_child(session)
	session.set_process(false)
	session.account = {"id": "qa-" + Crypto.new().generate_random_bytes(8).hex_encode(), "username": "qa"}
	session.token = "memory-only"
	session.online = true
	session.snapshot = sample_snapshot()
	session.journal_root = "res://.private/test-requests"
	check(session._prepare("start", "/me/trips", {"loadoutItemIds": ["test_food"], "expectedRevision": 1}), "write journal before network")
	var key: String = session.pending.key
	var text = FileAccess.get_file_as_string(session._journal_path())
	check(not "memory-only" in text and not "accessToken" in text and not "password" in text, "journal contains no credentials")
	check(session._read_pending().key == key, "pending key survives disk reload")
	var account_a = session.account.duplicate()
	session.account = {"id": "different", "username": "other"}
	check(session._read_pending().is_empty(), "journal isolated by account")
	session.account = account_a
	session.replies = [{"status": 0, "code": "NETWORK"}, {"status": 200, "body": sample_snapshot()}]
	await session.retry_pending()
	check(session.pending.get("key") == key, "unknown outcome preserves original key")
	var next = sample_snapshot(2)
	next.pet.status = "TRAVELING"
	next.activeTrip = {"id": "trip-a", "status": "TRAVELING", "startedAt": next.serverNow, "returnAt": "2026-10-17T09:01:00.000Z", "configVersion": "test-trip-v1", "destinationId": "test_forest"}
	session.replies = [{"status": 201, "body": {"trip": next.activeTrip, "snapshot": next}}, {"status": 200, "body": next}]
	await session.retry_pending()
	check(session.pending.is_empty() and session.snapshot.revision == 2, "confirmed write clears journal and accepts snapshot")
	check(session.sent[0].key == key and session.sent[2].key == key, "network retries use exactly same key")
	check(session.seconds_remaining() >= 59 and session.seconds_remaining() <= 60, "countdown uses server time and monotonic elapsed")
	session.accepted_at -= 61000
	check(session.seconds_remaining() == 0 and session.snapshot.activeTrip.status == "TRAVELING", "local deadline cannot authorize claim")
	session._expire()
	check(session.token.is_empty() and session.account.is_empty() and session.snapshot.is_empty(), "expiry clears account memory")
	for endpoint in ["http://127.0.0.1:3100@evil.example/v1", "http://example.com:80/v1", "https://example.com:99999/v1", "https://user:secret@example.com/v1"]:
		session.base_url = endpoint
		check(not session.endpoint_allowed(), "reject unsafe endpoint " + endpoint)
	session.base_url = "http://127.0.0.1:3100/v1"
	check(session.endpoint_allowed(), "debug loopback endpoint accepted")
	session.account = account_a
	session.token = "memory-only"
	session.online = true
	session.snapshot = sample_snapshot()
	session._prepare("start", "/me/trips", {"loadoutItemIds": ["test_food"], "expectedRevision": 1})
	key = session.pending.key
	session.replies = [{"status": 200, "body": {"unexpected": true}}, {"status": 200, "body": sample_snapshot()}]
	await session.retry_pending()
	check(session.pending.get("key") == key, "malformed success retains unresolved write")
	session.replies = [{"status": 429, "code": "RATE_LIMITED"}, {"status": 200, "body": sample_snapshot()}]
	await session.retry_pending()
	check(session.pending.get("key") == key, "rate limit retains original operation key")
	session.replies = [{"status": 409, "code": "REVISION_CONFLICT"}, {"status": 200, "body": sample_snapshot()}]
	await session.retry_pending()
	check(session.pending.is_empty(), "definite revision rejection enables a fresh user selection")
	session.replies = [{"status": 0, "code": "NETWORK"}]
	await session.logout()
	check(session.token == "memory-only", "unconfirmed logout retains ability to revoke session")
	session.replies = [{"status": 401, "code": "UNAUTHENTICATED"}]
	await session.refresh()
	check(session.token.is_empty() and not session.online, "401 clears authentication and online state")
	session.queue_free()
	await process_frame
	var delayed = DelayedSession.new()
	root.add_child(delayed)
	delayed.set_process(false)
	delayed.token = "account-a"
	delayed.account = {"id": "a", "username": "a"}
	delayed.response = {"status": 200, "body": sample_snapshot()}
	delayed.refresh()
	delayed._expire()
	delayed.token = "account-b"
	delayed.account = {"id": "b", "username": "b"}
	delayed.release_reply.emit()
	await process_frame
	check(delayed.snapshot.is_empty() and delayed.account.id == "b", "late account-A response cannot populate account B")
	delayed.queue_free()
	await process_frame
