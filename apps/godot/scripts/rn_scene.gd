extends Control
# RN owns account state, object hotspots and paper sheets. Godot owns the live room.
var rooms: Dictionary = {}
var maps: Array[RID] = []
var surface := "interior"
var events: Array = []
var options := {"available": true, "automatic": true, "reduced": false}

func _ready() -> void:
	name = "RNScene"
	resized.connect(_fit)
	mouse_filter = Control.MOUSE_FILTER_STOP
	show_surface("interior")

func _exit_tree() -> void:
	for map in maps:
		NavigationServer2D.free_rid(map)

func dispatch(raw: String) -> bool:
	var input = JSON.parse_string(raw)
	if not input is Dictionary:
		return false
	match input.get("type"):
		"state":
			for key in ["available", "automatic", "reduced"]:
				if not input.get(key) is bool:
					return false
			options = {"available": input.available, "automatic": input.automatic, "reduced": input.reduced}
			for room in rooms.values():
				room.set_options(options.automatic, options.reduced)
				room.pet.set_available(options.available)
				if not options.available: room.life.reset()
		"surface":
			if not input.get("value") in ["home", "interior", "courtyard"]:
				return false
			show_surface(input.value)
		"stroke":
			if rooms.has(surface): rooms[surface].life.touch()
		"life":
			if not input.get("value") is Dictionary or not rooms.has(surface): return false
			return rooms[surface].life.apply_snapshot(input.value)
		_:
			return false
	return true

func show_surface(value: String) -> void:
	var next_surface = "interior" if value == "home" else value
	if next_surface == surface and rooms.has(surface): return
	surface = next_surface
	if not rooms.has(surface):
		var room = load("res://scenes/room.tscn").instantiate()
		rooms[surface] = room
		add_child(room)
		room.configure(GameData.read_json("res://data/morning-" + surface + ".json"), GameData.read_json("res://data/morning-pet.json"))
		var life = load("res://scripts/cat_life.gd").new()
		room.add_child(life)
		life.request.connect(func(event, intent_id, target): _event({"type": "life_request", "surface": room.definition.id, "event": event, "intentId": intent_id, "target": target}))
		life.attach(room)
		# Each room has its own navigation map; hidden rooms cannot steal routes.
		var map := NavigationServer2D.map_create()
		NavigationServer2D.map_set_active(map, true)
		maps.append(map)
		room.region.set_navigation_map(map)
		room.pet.navigation.set_navigation_map(map)
		room.set_options(options.automatic, options.reduced)
		room.pet.set_available(options.available)
		room.hint_changed.connect(func(message): _event({"type": "hint", "message": message}))
		room.reading_requested.connect(func(): _event({"type": "life_request", "surface": room.definition.id, "event": "invite", "intentId": null, "target": "sunny", "invitedActivity": "read"}))
	for key in rooms:
		rooms[key].visible = key == surface
		rooms[key].process_mode = Node.PROCESS_MODE_INHERIT if key == surface else Node.PROCESS_MODE_DISABLED
	_fit()
	_event({"type": "surface", "value": surface})

func _fit() -> void:
	var factor := maxf(size.x / 390.0, size.y / 844.0)
	for room in rooms.values():
		room.scale = Vector2.ONE * factor
		room.position = (size - Vector2(390, 844) * factor) * 0.5

func _gui_input(event: InputEvent) -> void:
	if not rooms.has(surface): return
	var location: Vector2
	if event is InputEventScreenTouch and event.pressed:
		location = event.position
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		location = event.position
	else: return
	var room: HomeRoom = rooms[surface]
	room.interact_at((location - room.position) / room.scale)
	accept_event()

func _event(value: Dictionary) -> void:
	if events.size() >= 64: events.pop_front()
	events.append(value)

func take_events() -> String:
	var result := JSON.stringify(events)
	events.clear()
	return result
