extends Node
# The server owns intentions and outcomes. This controller reports physical arrival.
signal request(event: String, intent_id: Variant, target: Variant)
var room: Node2D
var pet: HomePet
var enabled := true
var reduced := false
var intent: Dictionary = {}
var arrived := false
var held := 0.0
var walking := 0.0
var waiting := 0.0
var reported := false
var gesture := 0.0
var local_sequence := 0
var needs := {"hunger": 0.3, "fatigue": 0.4, "stimulation": 0.5, "alertness": 0.1}
var cushion := "shelter"
var manual_pending := false
var deferred_intent: Dictionary = {}
var deferred_held := 0.0
var slot: Dictionary = {}
var use_confirmed := false
var arrival_wait := 0.0
var last_report := ""
const ACTIVITIES = ["sleep", "eat", "drink", "toilet", "read", "watch", "sniff", "rest", "approach", "retreat"]
const HINTS = {"sleep": "蜷着身子，慢慢睡着了", "eat": "在食盆边，慢慢吃几口", "drink": "低下头，喝一点清水", "toilet": "给它一点私密的时间", "read": "正翻看一本小小的图画书", "watch": "耳朵竖着，安静地望向远处", "sniff": "走近一点，仔细看看这里", "rest": "找个舒服的地方趴着", "approach": "慢慢靠过来，待在你身边", "retreat": "它想独自安静一会儿"}

func attach(value: Node2D) -> void:
	room = value
	pet = room.pet
	pet.automatic = false
	pet.external_hold = true
	room.life = self
	request.emit("observe", null, null)

func set_options(automatic: bool, reduce: bool) -> void:
	enabled = automatic
	reduced = reduce
	pet.automatic = false
	# Reduced motion changes presentation, never the server's life simulation.
	if reduced and not intent.is_empty() and not arrived and not slot.is_empty():
		pet.position = GameData.point(slot.position)
		pet.queued_walk = false
		pet.after_arrival = {}
		pet.velocity = Vector2.ZERO
		pet._set_state("idle")

func reset() -> void:
	intent = {}
	deferred_intent = {}
	deferred_held = 0.0
	reported = false
	last_report = ""
	arrived = false
	use_confirmed = false
	waiting = 0.0
	gesture = 0.0
	if pet:
		pet.visible = pet.available
		pet.queued_walk = false
		pet.after_arrival = {}
		pet.velocity = Vector2.ZERO
		pet._set_state("rest")

func apply_snapshot(value: Dictionary) -> bool:
	if not value.get("needs") is Dictionary or not value.get("cushion") in ["sunny", "shelter"]: return false
	for key in ["hunger", "fatigue", "stimulation", "alertness"]:
		var amount = value.needs.get(key)
		if not (amount is float or amount is int) or not is_finite(float(amount)) or float(amount) < 0 or float(amount) > 1: return false
	var next = value.get("intent")
	if next != null:
		if not next is Dictionary or not next.get("activity") in ACTIVITIES or room.life_slot(str(next.get("spot", ""))).is_empty(): return false
		if not next.get("durationSeconds") is float and not next.get("durationSeconds") is int: return false
		if next.get("surface") != room.definition.id or str(next.get("id", "")).length() != 36 or float(next.durationSeconds) < 1 or float(next.durationSeconds) > 180: return false
		if next.get("protocolVersion") == 2 and not next.get("stage") in ["moving", "using"]: return false
		if next.get("stage") == "using" and not next.get("usingAt") is String: return false
	needs = value.needs.duplicate()
	cushion = value.cushion
	# Keep the mattress under a sleeping pet until that activity ends.
	if intent.get("activity") != "sleep" or next == null:
		room.move_prop("cat-bed", _point(cushion) + GameData.point(room.definition.get("cushion_anchor_offset", [0, 0])))
	if value.get("facilities") is Dictionary: room.show_facilities(value.facilities)
	if next == null:
		reset()
		return true
	if next.id == intent.get("id"):
		intent = next.duplicate()
		_confirm_use(value)
		# An early/stale completion can return the same intent. Retry after the
		# authoritative remaining time instead of becoming stuck in observe-only mode.
		if reported and last_report == "complete" and use_confirmed:
			reported = false
			held = minf(_server_elapsed(value), float(intent.durationSeconds) - 0.25)
		return true
	if not pet.available: return true
	manual_pending = false
	_start(next)
	if not deferred_intent.is_empty() and next.get("stage") == "using" and value.get("serverNow") is String:
		deferred_held = clampf(_timestamp(value.serverNow) - _timestamp(next.usingAt), 0, float(next.durationSeconds))
	_confirm_use(value)
	return true

func _confirm_use(value: Dictionary) -> void:
	if intent.get("protocolVersion") != 2:
		use_confirmed = true
		return
	if intent.get("stage") != "using": return
	var was_confirmed := use_confirmed
	use_confirmed = true
	held = maxf(held, _server_elapsed(value))
	if arrived and not was_confirmed: _pose()

func _timestamp(raw: String) -> float:
	var parts = raw.trim_suffix("Z").split(".")
	var seconds := float(Time.get_unix_time_from_datetime_string(parts[0]))
	return seconds + (float("0." + parts[1]) if parts.size() == 2 else 0.0)

func _server_elapsed(value: Dictionary) -> float:
	if not value.get("serverNow") is String or not intent.get("usingAt") is String: return 0
	return clampf(_timestamp(value.serverNow) - _timestamp(intent.usingAt), 0, float(intent.durationSeconds))

func _point(spot: String) -> Vector2:
	var resolved: Dictionary = room.life_slot(spot)
	return GameData.point(resolved.position) if not resolved.is_empty() else pet.position

func _start(next: Dictionary) -> void:
	if not room.navigation_ready:
		deferred_intent = next.duplicate()
		return
	intent = next.duplicate()
	slot = room.life_slot(intent.spot)
	arrived = false
	held = 0
	walking = 0
	waiting = 0
	reported = false
	last_report = ""
	gesture = 0
	arrival_wait = 0
	use_confirmed = intent.get("protocolVersion") != 2 or intent.get("stage") == "using"
	pet.visible = pet.available
	pet.external_hold = true
	# The foot position and nose/book contact share the same room coordinate system.
	var destination = GameData.point(slot.position)
	if intent.activity in ["eat", "drink"] and slot.has("contact"):
		destination = GameData.point(slot.contact) - pet.contact_offset("eat")
		slot.position = [destination.x, destination.y]
	if not pet.go_to(destination, {"action": "idle", "facing": slot.get("facing", "front")}, false):
		_report("blocked")
	else:
		if reduced:
			pet.position = destination
			pet.queued_walk = false
			pet.after_arrival = {}
			pet.velocity = Vector2.ZERO
			pet._set_state("idle")
		if not _is_local(): request.emit("started", intent.id, null)

func _is_local() -> bool:
	return str(intent.get("id", "")).begins_with("local-")

func _report(event: String) -> void:
	reported = true
	last_report = event
	waiting = 0
	if _is_local(): request.emit("observe", null, null)
	else: request.emit(event, intent.get("id"), null)

func touch() -> void:
	if not pet.available: return
	manual_pending = true
	request.emit("stroke", intent.get("id") if not _is_local() else null, null)
	if intent.get("activity") in ["sleep", "eat", "drink", "toilet"]:
		room.hint_changed.emit("让它先忙完这一小会儿")
	elif pet.state == "read" and room.definition.has("reading_pose"):
		# Keep the seated contact instead of playing the floor-petting animation.
		pet.sprite.set_frame_and_progress(1, 0)
		room.hint_changed.emit("它眯了眯眼，继续陪你坐一会儿")
	elif pet.state not in ["walk", "rise", "lie_down"]:
		pet._begin_life("pet")
		gesture = 2.5
		room.hint_changed.emit("轻轻摸一下，留一点自己的空间给它")

func invite(point: Vector2) -> void:
	if not pet.available: return
	var target := "sunny" if point.distance_to(_point("sunny")) < point.distance_to(_point("shelter")) else "shelter"
	manual_pending = true
	request.emit("invite", null, target)
	room.hint_changed.emit("轻轻招呼它，等它自己决定")

func _local() -> void:
	# Offline presentation never consumes food or invents a completed server activity.
	local_sequence += 1
	var action := "watch" if local_sequence % 2 == 0 else "rest"
	_start({"id": "local-" + str(local_sequence), "activity": action, "spot": "sunny" if action == "watch" else cushion, "durationSeconds": 45})

func _pose() -> void:
	var activity: String = intent.get("activity", "rest")
	pet.visible = pet.available and activity != "toilet"
	pet.facing = slot.get("facing", "front")
	if activity in ["eat", "drink"]: pet._begin_life("eat")
	elif activity == "read": pet._begin_life("read")
	elif activity == "sleep": pet._begin_life("sleep")
	elif activity in ["rest", "retreat", "toilet"]: pet._set_state("rest")
	else: pet._set_state("idle")
	room.hint_changed.emit(HINTS[activity])

func _process(delta: float) -> void:
	if not pet.available or not room.navigation_ready: return
	if not deferred_intent.is_empty():
		var next := deferred_intent
		var elapsed := deferred_held
		deferred_intent = {}
		deferred_held = 0.0
		_start(next)
		held = maxf(held, elapsed)
	if gesture > 0:
		gesture -= delta
		if gesture <= 0:
			if not intent.is_empty() and use_confirmed: _pose()
			else: pet._set_state("rest")
		return
	if intent.is_empty() or reported:
		waiting += delta
		if waiting >= 12:
			waiting = 0
			request.emit("observe", null, null)
			if enabled and (intent.is_empty() or _is_local()): _local()
		return
	if not arrived:
		walking += delta
		if pet.state not in ["walk", "rise", "lie_down"] and pet.position.distance_to(GameData.point(slot.position)) < 8:
			arrived = true
			if use_confirmed: _pose()
			else: request.emit("arrived", intent.id, null)
		elif walking > 22: _report("blocked")
		return
	if not use_confirmed:
		arrival_wait += delta
		if arrival_wait >= 4:
			arrival_wait = 0
			request.emit("arrived", intent.id, null)
		return
	held += delta
	if intent.activity in ["watch", "sniff"] and not reduced:
		var face: String = slot.get("facing", "back" if intent.activity == "watch" else "front")
		if fmod(held, 12) > 10: face = "left"
		if pet.facing != face: pet.facing = face; pet._play_pose()
	if held >= float(intent.durationSeconds): _report("complete")
