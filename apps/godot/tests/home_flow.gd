extends SceneTree

var app: Control
var directory := "res://.private/home-flow"
var checks := 0

func _initialize() -> void:
	run.call_deferred()

func verify(value: bool, label: String) -> void:
	assert(value, label)
	checks += 1

func settle() -> void:
	await process_frame
	await process_frame

func click(control: Control) -> void:
	if not is_instance_valid(control):
		push_error("Pointer target is missing")
		quit(1)
		return
	var event := InputEventMouseButton.new()
	event.position = control.get_global_rect().get_center()
	event.button_index = MOUSE_BUTTON_LEFT
	event.pressed = true
	root.push_input(event)
	event = event.duplicate()
	event.pressed = false
	root.push_input(event)
	await settle()

func button_with_text(parent: Node, text: String) -> Button:
	if parent is Button and parent.text == text:
		return parent
	for child in parent.get_children():
		var found := button_with_text(child, text)
		if found: return found
	return null

func capture(name: String) -> void:
	await RenderingServer.frame_post_draw
	verify(root.get_texture().get_image().save_png(directory + "/" + name + ".png") == OK, "capture " + name)

func run() -> void:
	DirAccess.make_dir_recursive_absolute(directory)
	root.size = Vector2i(390, 844)
	app = load("res://scenes/main.tscn").instantiate()
	root.add_child(app)
	app.session.set_process(false)
	app.session.token = "visual-fixture-not-a-credential"
	app.session.account = {"id": "fixture", "username": "视觉验收"}
	app.session.snapshot = {"player": {"id": "fixture", "username": "视觉验收"}, "configVersion": "starter-v1", "pet": {"id": "fixture-cat", "nickname": "小猫", "speciesId": "test_species", "status": "AT_HOME"}, "inventory": [{"itemId": "test_food", "quantity": 3}, {"itemId": "test_supply", "quantity": 2}], "collection": [{"itemId": "test_postcard_forest", "quantity": 1, "firstCollectedAt": "2026-10-18T00:00:00Z"}, {"itemId": "test_postcard_stream", "quantity": 1, "firstCollectedAt": "2026-10-18T00:00:00Z"}], "activeTrip": null, "revision": 1, "serverNow": "2026-10-18T00:00:00Z"}
	app.session.online = true
	app._draw_page()
	await settle()
	await capture("home")
	await click(app.home.canvas.get_node("准备行囊"))
	verify(app.current_page == "bag", "pointer click opens bag")
	await capture("bag")
	await click(button_with_text(app, "装入  旅行食物\n剩余 3 份"))
	verify(app.draft == ["test_food"], "selection updates draft without consuming inventory")
	verify(app.session.snapshot.inventory[0].quantity == 3, "selection preserves inventory")
	verify(button_with_text(app, "已装好  旅行食物\n剩余 3 份").button_pressed, "selected item exposes pressed state")
	await capture("bag-selected")
	await click(button_with_text(app, "已装好  旅行食物\n剩余 3 份"))
	verify(app.draft.is_empty(), "second click removes selection")
	await click(button_with_text(app, "返回家园"))
	verify(is_instance_valid(app.home), "pointer back returns to selected home")
	await click(app.home.canvas.get_node("收藏"))
	verify(app.current_page == "collection", "pointer click opens collection")
	await capture("collection")
	var collection_art = app.content.find_children("*", "TextureRect", true, false)
	verify(collection_art.size() == 2, "forest and stream rewards both have artwork")
	for art in collection_art:
		verify(art.texture != null, "collection art loads")
	app.content.get_parent().scroll_vertical = 320
	await settle()
	await capture("collection-stream")
	await click(button_with_text(app, "返回家园"))
	await click(app.home.canvas.get_node("菜单"))
	verify(app.home.menu.visible, "pointer click opens menu")
	await click(app.home.menu_dismiss)
	verify(not app.home.menu.visible, "outside click dismisses menu")
	await click(app.home.canvas.get_node("菜单"))
	await capture("menu")
	await click(button_with_text(app.home.menu, "小屋设置"))
	verify(app.current_page == "settings", "menu opens settings")
	await click(button_with_text(app, "返回家园"))
	await click(app.home.canvas.get_node("去庭院"))
	verify(app.current_page == "activity" and app.current_room == "courtyard", "pointer click enters courtyard")
	var active_room = app.room
	await click(button_with_text(app, "庭院"))
	verify(app.room == active_room and button_with_text(app, "庭院").button_pressed, "active room tab preserves room and selection")
	await capture("activity")
	await click(button_with_text(app, "小屋"))
	verify(app.current_room == "interior" and button_with_text(app, "小屋").button_pressed, "room tab opens interior")
	await capture("interior")
	await click(button_with_text(app, "返回家园"))
	app.session.online = false
	app._draw_page()
	await settle()
	verify(is_instance_valid(button_with_text(app, "重新连接")), "offline home exposes recovery")
	await capture("offline")
	app.session.online = true
	app.session.snapshot.pet.status = "TRAVELING"
	app._draw_page()
	await settle()
	verify(not app.home.cat.visible, "travel state hides sprite")
	await capture("away")
	app.session.snapshot.pet.status = "AT_HOME"
	app._draw_page()
	root.content_scale_size = Vector2i(320, 568)
	root.size = Vector2i(320, 568)
	await settle()
	var menu_size = app.home.canvas.get_node("菜单").get_global_rect().size
	verify(menu_size.x >= 43.9 and menu_size.y >= 43.9, "small screen retains 44 point menu target")
	await capture("small-home")
	await click(app.home.canvas.get_node("准备行囊"))
	verify(app.current_page == "bag", "small viewport pointer opens bag")
	await capture("small-bag")
	verify(button_with_text(app, "带上行囊，出发 · 60 秒").get_global_rect().end.y <= 492, "small bag departure action visible above navigation")
	await click(button_with_text(app, "旅途"))
	await capture("small-trip")
	await click(button_with_text(app, "返回家园"))
	await click(app.home.canvas.get_node("去庭院"))
	var stage = app.find_child("RoomViewport", true, false)
	verify(stage != null and stage.size.x <= 320.1, "small room fits viewport width")
	var status = app.find_child("ActivityStatus", true, false)
	verify(status != null and status.get_global_rect().end.y <= stage.get_global_rect().position.y, "small screen status appears before scene")
	verify(stage.get_global_rect().position.y < 110, "compact activity controls leave scene near top")
	verify(absf(stage.size.y / stage.size.x - 560.0 / 390.0) < 0.01, "small room preserves aspect ratio")
	app.room.pet.automatic = false
	for tick in 120:
		await physics_frame
		if app.room.navigation_ready: break
	var target := Vector2(270, 300)
	var event := InputEventMouseButton.new()
	event.position = stage.get_global_rect().position + target * stage.size / Vector2(390, 560)
	event.button_index = MOUSE_BUTTON_LEFT
	event.pressed = true
	root.push_input(event)
	event = event.duplicate()
	event.pressed = false
	root.push_input(event)
	await settle()
	verify(app.room.pet.state == "walk", "scaled room pointer starts walking")
	for tick in 900:
		await physics_frame
		if app.room.pet.state != "walk": break
	verify(app.room.pet.position.distance_to(target) < 8, "scaled room pointer reaches intended location")
	await capture("small-activity")
	await click(button_with_text(app, "小屋"))
	verify(app.current_room == "interior", "small viewport opens interior")
	await capture("small-interior")
	print("HOME_FLOW: ", checks, " checks passed; actual viewport pointer events")
	quit()
