extends Control

const ROOM_SCENE = preload("res://scenes/room.tscn")
const GREEN = Color("#526b55")
const INK = Color("#34433a")
const MUTED = Color("#626e61")
const PAPER = Color("#fbf9f3")
const ACCENT = Color("#aa5030")
const ITEM_ART = {"test_food": "bento", "test_supply": "water", "test_postcard_forest": "forest", "test_postcard_stream": "stream", "test_postcard_meadow": "garden"}
const CATALOG = {
	"test_food": {"name": "旅行食物", "detail": "出发时使用 1 份"},
	"test_supply": {"name": "旅行用品", "detail": "出发时使用 1 份"},
	"test_postcard_forest": {"name": "林间明信片", "detail": "来自森林的一点回忆"},
	"test_postcard_stream": {"name": "溪流明信片", "detail": "来自溪流的一点回忆"},
	"test_postcard_meadow": {"name": "草地明信片", "detail": "来自草地的一点回忆"},
}
var session := GameSession.new()
var current_page := "home"
var current_room := "interior"
var room: HomeRoom
var home: EngawaHome
var rooms: Dictionary = {}
var pet_pack: Dictionary
var layout := VBoxContainer.new()
var content: Control
var toast: Label
var status_label: Label
var countdown_label: Label
var draft: Array = []
var automatic := true
var reduced := false
var username := ""
var password := ""
var registration := false
var rendered_session := ""
var last_rewards: Array = []
var pending_redraw := false
var password_fields: Array = []
var settings_file := "user://preferences.cfg"
var focus_paused := false

func _ready() -> void:
	Engine.max_fps = 60
	add_child(session)
	var font = SystemFont.new()
	font.font_names = PackedStringArray(["PingFang SC", "Heiti SC", "Arial"])
	var visual_theme = Theme.new()
	visual_theme.default_font = font
	visual_theme.default_font_size = 15
	visual_theme.set_color("font_color", "Label", INK)
	visual_theme.set_color("font_color", "Button", INK)
	visual_theme.set_color("font_focus_color", "Button", INK)
	visual_theme.set_color("font_hover_color", "Button", INK)
	visual_theme.set_color("font_pressed_color", "Button", INK)
	visual_theme.set_color("font_disabled_color", "Button", MUTED)
	visual_theme.set_stylebox("normal", "Button", _box(Color("#f4eddd"), 8))
	visual_theme.set_stylebox("hover", "Button", _box(Color("#e4ebdf"), 12))
	visual_theme.set_stylebox("pressed", "Button", _box(Color("#d4e0cf"), 12))
	visual_theme.set_stylebox("disabled", "Button", _box(Color("#eeeee7"), 12))
	visual_theme.set_stylebox("focus", "Button", _box(Color(0, 0, 0, 0), 12, GREEN))
	visual_theme.set_stylebox("normal", "LineEdit", _box(Color("#ffffff"), 10, Color("#d7ddcf")))
	visual_theme.set_stylebox("focus", "LineEdit", _box(Color("#ffffff"), 10, GREEN))
	visual_theme.set_color("font_color", "LineEdit", INK)
	visual_theme.set_color("font_placeholder_color", "LineEdit", MUTED)
	var scroll_track := StyleBoxFlat.new()
	scroll_track.bg_color = PAPER
	scroll_track.content_margin_left = 3
	scroll_track.content_margin_right = 3
	visual_theme.set_stylebox("scroll", "VScrollBar", scroll_track)
	for state in ["grabber", "grabber_highlight", "grabber_pressed"]:
		var thumb := StyleBoxFlat.new()
		thumb.bg_color = Color("#b4bdae")
		thumb.set_corner_radius_all(3)
		thumb.content_margin_left = 3
		thumb.content_margin_right = 3
		visual_theme.set_stylebox(state, "VScrollBar", thumb)
	theme = visual_theme
	var prefs = ConfigFile.new()
	if prefs.load(settings_file) == OK:
		automatic = prefs.get_value("home", "automatic", true)
		reduced = prefs.get_value("home", "reduced", false)
	reduced = reduced or DisplayServer.accessibility_should_reduce_animation() == 1
	for id in ["interior", "courtyard"]:
		rooms[id] = GameData.read_json("res://data/" + id + ".json")
		var errors = GameData.validate_room(rooms[id], ["interior", "courtyard"])
		if not errors.is_empty():
			_fatal("\n".join(errors))
			return
	pet_pack = GameData.read_json("res://data/pet.json")
	var pet_errors = GameData.validate_pet(pet_pack)
	if not pet_errors.is_empty():
		_fatal("\n".join(pet_errors))
		return
	session.changed.connect(_session_changed)
	session.notice.connect(_notice)
	session.reward_received.connect(func(rewards):
		last_rewards = rewards
		current_page = "return")
	add_child(layout)
	layout.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	layout.add_theme_constant_override("separation", 0)
	_draw_page()

func _box(color: Color, radius: int, border: Color = Color.TRANSPARENT) -> StyleBoxFlat:
	var box = StyleBoxFlat.new()
	box.bg_color = color
	box.set_corner_radius_all(radius)
	box.content_margin_left = 16
	box.content_margin_right = 16
	box.content_margin_top = 11
	box.content_margin_bottom = 11
	if border.a > 0:
		box.border_color = border
		box.set_border_width_all(1)
	return box

func _label(text: String, size_px: int = 15, color: Color = INK) -> Label:
	var label = Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", size_px)
	label.add_theme_color_override("font_color", color)
	if size_px >= 22:
		var heading_font := SystemFont.new()
		heading_font.font_names = PackedStringArray(["Songti SC", "Noto Serif CJK SC", "PingFang SC"])
		label.add_theme_font_override("font", heading_font)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return label

func _button(text: String, action: Callable, primary: bool = false) -> Button:
	var button = Button.new()
	button.text = text
	button.custom_minimum_size.y = 46
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	button.pressed.connect(action)
	button.focus_mode = Control.FOCUS_ALL
	if primary:
		button.add_theme_stylebox_override("normal", _box(ACCENT, 8))
		button.add_theme_stylebox_override("hover", _box(Color("#994629"), 8))
		button.add_theme_stylebox_override("pressed", _box(Color("#873c24"), 8))
		button.add_theme_color_override("font_color", Color.WHITE)
		button.add_theme_color_override("font_hover_color", Color.WHITE)
		button.add_theme_color_override("font_pressed_color", Color.WHITE)
		button.add_theme_color_override("font_focus_color", Color.WHITE)
	return button

func _art(name: String, height: float) -> TextureRect:
	var image := TextureRect.new()
	image.texture = load("res://assets/ui/" + name + ".png")
	image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	image.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	image.custom_minimum_size = Vector2(height, height)
	image.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return image

func _column(parent: Node, margin: int = 22) -> VBoxContainer:
	var padding = MarginContainer.new()
	for side in ["left", "right", "top", "bottom"]:
		padding.add_theme_constant_override("margin_" + side, margin)
	parent.add_child(padding)
	var column = VBoxContainer.new()
	column.add_theme_constant_override("separation", 14)
	padding.add_child(column)
	return column

func _clear_layout() -> void:
	home = null
	toast = null
	if is_instance_valid(room):
		room = null
	status_label = null
	countdown_label = null
	for child in layout.get_children():
		layout.remove_child(child)
		child.queue_free()

func _draw_page() -> void:
	pending_redraw = false
	rendered_session = _session_view()
	_clear_layout()
	if current_page == "home" and not session.token.is_empty() and not session.snapshot.is_empty():
		_engawa_page()
		return
	var header = _column(layout, 8 if current_page == "activity" else 20)
	var row = HBoxContainer.new()
	header.add_child(row)
	if not session.token.is_empty() and not session.snapshot.is_empty():
		var back = _button("返回家园", func(): _open("home"))
		back.flat = true
		row.add_child(back)
		var space := Control.new()
		space.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(space)
		if current_page == "activity":
			for id in ["interior", "courtyard"]:
				var tab = _button("小屋" if id == "interior" else "庭院", func():
					if current_room != id:
						_switch_room(id))
				tab.toggle_mode = true
				tab.button_pressed = current_room == id
				if current_room == id:
					tab.pressed.connect(func(): tab.set_pressed_no_signal(true))
				var plain = _box(Color.TRANSPARENT, 0)
				var selected = _box(Color.TRANSPARENT, 0)
				selected.border_color = ACCENT
				selected.border_width_bottom = 2
				tab.add_theme_stylebox_override("normal", plain)
				tab.add_theme_stylebox_override("pressed", selected)
				tab.add_theme_color_override("font_pressed_color", ACCENT)
				tab.add_theme_color_override("font_hover_pressed_color", ACCENT)
				row.add_child(tab)
		else:
			var subtitle = _label("窗边小屋", 14, MUTED)
			subtitle.autowrap_mode = TextServer.AUTOWRAP_OFF
			row.add_child(subtitle)
	else:
		var title = _label("丸宠", 22)
		title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(title)
		row.add_child(_label("窗边小屋", 14, MUTED))
	var scroll = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	layout.add_child(scroll)
	var body = VBoxContainer.new()
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", 0)
	scroll.add_child(body)
	content = body
	if session.token.is_empty():
		_login_page(body)
	elif session.snapshot.is_empty():
		var column = _column(body)
		column.add_child(_label("正在打开你的家园", 24))
		column.add_child(_label("登录后从服务器恢复宠物、背包与旅行记录。", 14, MUTED))
		column.add_child(_button("重新读取存档", func(): session.refresh(true)))
		if not session.pending.is_empty():
			column.add_child(_button("重试初始化", session.retry_pending))
	else:
		if not session.online:
			var warning = _column(body, 12)
			warning.add_child(_label("暂时离线 · 存档只读", 13, MUTED))
			warning.add_child(_button("重新连接", session.refresh))
		if not session.pending.is_empty():
			var pending_box = _column(body, 12)
			pending_box.add_child(_label("有一个操作尚待确认", 14))
			var retry = _button("核对并重试", _retry_pending)
			retry.disabled = session.busy
			pending_box.add_child(retry)
		match current_page:
			"activity": _home_page(body)
			"bag": _bag_page(body)
			"trip": _trip_page(body)
			"collection": _collection_page(body)
			"return": _return_page(body)
			"settings": _settings_page(body)
		_navigation()
	toast = _label("", 13, GREEN)
	toast.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	toast.custom_minimum_size.y = 30
	layout.add_child(toast)

func _engawa_page() -> void:
	home = EngawaHome.new()
	home.size_flags_vertical = Control.SIZE_EXPAND_FILL
	home.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	layout.add_child(home)
	content = home
	home.set_pet_available(session.snapshot.pet.status == "AT_HOME")
	home.set_reduced_motion(reduced)
	home.process_mode = Node.PROCESS_MODE_DISABLED if focus_paused else Node.PROCESS_MODE_INHERIT
	home.open_requested.connect(func(page):
		if page == "activity":
			_switch_room("interior")
		else:
			_open(page))
	home.courtyard_requested.connect(func(): _switch_room("courtyard"))
	# Service state overlays the art rather than shrinking the selected composition.
	if not session.online or not session.pending.is_empty():
		var notice = PanelContainer.new()
		home.add_child(notice)
		notice.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
		notice.offset_left = 18
		notice.offset_right = -18
		notice.offset_top = 190
		notice.add_theme_stylebox_override("panel", _box(PAPER, 8))
		var column = VBoxContainer.new()
		notice.add_child(column)
		if not session.online:
			column.add_child(_label("暂时离线 · 存档只读", 14))
			column.add_child(_button("重新连接", session.refresh))
		if not session.pending.is_empty():
			column.add_child(_label("有一个操作尚待确认", 14))
			var retry = _button("核对并重试", _retry_pending)
			retry.disabled = session.busy
			column.add_child(retry)
	toast = _label("", 13, INK)
	toast.mouse_filter = Control.MOUSE_FILTER_IGNORE
	toast.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	home.add_child(toast)
	toast.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	toast.offset_top = -170
	toast.offset_bottom = -140

func _queue_draw_page() -> void:
	if not pending_redraw:
		pending_redraw = true
		_draw_page.call_deferred()

func _open(page: String) -> void:
	current_page = page
	_queue_draw_page()

func _login_page(parent: Node) -> void:
	var column = _column(parent, 26)
	var art = TextureRect.new()
	art.texture = GameData.texture("res://assets/engawa/home-clean.png", [0, 450, 853, 1000])
	art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	art.custom_minimum_size.y = 220
	column.add_child(art)
	column.add_child(_label("留一盏灯，等它回家", 26))
	column.add_child(_label("准备行囊，收集回忆。\n从你的账号，打开这间小屋。", 14, MUTED))
	var user = LineEdit.new()
	user.placeholder_text = "用户名"
	user.text = username
	user.custom_minimum_size.y = 48
	user.text_changed.connect(func(value): username = value)
	column.add_child(user)
	var secret = LineEdit.new()
	secret.placeholder_text = "密码（至少 15 个字符）"
	secret.secret = true
	secret.text = password
	secret.custom_minimum_size.y = 48
	secret.text_changed.connect(func(value): password = value)
	column.add_child(secret)
	var submit = _button("创建账号" if registration else "登录并回家", func():
		var submitted_password = password
		password = ""
		secret.text = ""
		await session.authenticate(username, submitted_password, registration), true)
	submit.disabled = session.busy
	column.add_child(submit)
	var toggle = _button("已有账号，去登录" if registration else "第一次来，创建账号", func():
		registration = not registration
		password = ""
		_queue_draw_page())
	toggle.disabled = session.busy
	column.add_child(toggle)
	column.add_child(_label("当前为测试旅行版本。关闭后需要重新登录，账号存档保存在服务器。", 12, MUTED))

func _home_page(parent: Node) -> void:
	var top = _column(parent, 8)
	status_label = _label("自在休息" if session.snapshot.pet.status == "AT_HOME" else "正在旅行，等它回家", 14, MUTED)
	status_label.name = "ActivityStatus"
	status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	top.add_child(status_label)
	var stage = SubViewportContainer.new()
	stage.name = "RoomViewport"
	stage.custom_minimum_size = Vector2(0, 560)
	stage.resized.connect(func():
		stage.custom_minimum_size.y = stage.size.x * 560.0 / 390.0)
	stage.stretch = true
	stage.mouse_filter = Control.MOUSE_FILTER_STOP
	parent.add_child(stage)
	var viewport = SubViewport.new()
	viewport.size = Vector2i(390, 560)
	viewport.size_2d_override = Vector2i(390, 560)
	viewport.size_2d_override_stretch = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	viewport.world_2d = World2D.new()
	stage.add_child(viewport)
	room = ROOM_SCENE.instantiate()
	viewport.add_child(room)
	room.configure(rooms[current_room], pet_pack)
	room.set_options(automatic, reduced)
	if focus_paused:
		room.process_mode = Node.PROCESS_MODE_DISABLED
	room.pet.set_available(session.snapshot.pet.status == "AT_HOME")
	room.door_requested.connect(func(target):
		_switch_room(target.room, GameData.point(target.spawn)))
	room.hint_changed.connect(func(message):
		if is_instance_valid(status_label):
			status_label.text = message)
	stage.gui_input.connect(func(event):
		if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
			room.interact_at(event.position * Vector2(390, 560) / stage.size)
			stage.accept_event())
	stage.focus_mode = Control.FOCUS_ALL
	stage.tooltip_text = "点击地面移动，点击猫咪抚摸，点击猫窝或食盆互动"
	var summary = _column(parent, 20)
	summary.add_child(_label(session.snapshot.pet.nickname, 23))
	summary.add_child(_label("点地面散步 · 点猫咪抚摸 · 点猫窝与食盆互动", 12, MUTED))
	var row_actions = HBoxContainer.new()
	row_actions.add_theme_constant_override("separation", 8)
	summary.add_child(row_actions)
	var bag = _button("准备行囊", func(): _open("bag"), true)
	bag.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row_actions.add_child(bag)
	row_actions.add_child(_button("设置", func(): _open("settings")))

func _switch_room(id: String, spawn: Variant = null) -> void:
	current_page = "activity"
	current_room = id
	_draw_page()
	if spawn != null and is_instance_valid(room):
		room.pet.position = spawn

func _bag_page(parent: Node) -> void:
	var column = _column(parent)
	column.add_child(_label("准备一点心意", 26))
	column.add_child(_label("选中的每种物品，在成功出发时消耗 1 份。", 14, MUTED))
	var available: Array = []
	for item in session.snapshot.inventory:
		if item.itemId in ["test_food", "test_supply"] and item.quantity > 0:
			available.append(item.itemId)
	draft = draft.filter(func(id): return id in available)
	var compact_bag := get_viewport_rect().size.y < 700
	var items := HBoxContainer.new()
	items.add_theme_constant_override("separation", 16)
	column.add_child(items)
	for id in ["test_food", "test_supply"]:
		var quantity = 0
		for item in session.snapshot.inventory:
			if item.itemId == id:
				quantity = int(item.quantity)
		var row = _button(("已装好  " if id in draft else ("已用完  " if quantity < 1 else "装入  ")) + CATALOG[id].name + "\n剩余 " + str(quantity) + " 份", func():
			if id in draft: draft.erase(id)
			else: draft.append(id)
			_queue_draw_page())
		row.toggle_mode = true
		row.button_pressed = id in draft
		row.tooltip_text = ("从行囊取出" if id in draft else "装入行囊") + CATALOG[id].name
		row.disabled = quantity < 1 or session.busy or not session.pending.is_empty()
		row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.custom_minimum_size = Vector2(0, 180 if compact_bag else 226)
		row.add_theme_font_size_override("font_size", 14)
		for state in ["normal", "hover", "pressed", "hover_pressed", "disabled"]:
			var surface = _box(Color("#edf0e5") if id in draft else Color.TRANSPARENT, 4)
			surface.border_color = GREEN if id in draft else Color("#d7ddcf")
			surface.border_width_bottom = 2 if id in draft else 1
			surface.content_margin_left = 6
			surface.content_margin_right = 6
			surface.content_margin_top = 118 if compact_bag else 164
			surface.content_margin_bottom = 16
			row.add_theme_stylebox_override(state, surface)
		row.add_theme_color_override("font_hover_pressed_color", INK)
		var illustration = _art(ITEM_ART[id], 0)
		illustration.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
		illustration.offset_left = 8
		illustration.offset_right = -8
		illustration.offset_top = 12
		illustration.offset_bottom = 110 if compact_bag else 156
		if quantity < 1: illustration.modulate.a = 0.4
		row.add_child(illustration)
		items.add_child(row)
	column.add_child(_label("已装好 %d 件 · 每种带一份" % draft.size(), 13, MUTED))
	var start = _button("带上行囊，出发 · 60 秒", func():
		await session.start_trip(draft)
		if session.snapshot.get("activeTrip") != null:
			draft = []
			_open("trip"), true)
	start.disabled = draft.is_empty() or session.busy or not session.online or session.snapshot.activeTrip != null or not session.pending.is_empty()
	column.add_child(start)
	if session.snapshot.activeTrip != null:
		column.add_child(_label("已有旅行。请先查看旅途并领取归来的物品。", 14))
	column.add_child(_label("体验版本 · 这是一段约 60 秒的短途旅行。", 12, MUTED))

func _trip_page(parent: Node) -> void:
	var column = _column(parent)
	column.add_child(_label("去看看远处的风景", 26))
	column.add_child(_art("forest", 190))
	var trip = session.snapshot.activeTrip
	if trip == null:
		column.add_child(_label("远方还在等它。\n准备好行囊，再慢慢出发。", 15, MUTED))
		column.add_child(_button("准备行囊", func(): _open("bag"), true))
		return
	column.add_child(_label("林间小路", 22))
	countdown_label = _label("", 30, GREEN)
	column.add_child(countdown_label)
	column.add_child(_label("小屋会为它留着。你可以关掉应用，下次登录时继续查看。", 15, MUTED))
	var claim = _button("领取带回的物品", session.claim_trip, true)
	claim.disabled = trip.status != "READY_TO_CLAIM" or session.busy or not session.online or not session.pending.is_empty()
	column.add_child(claim)
	column.add_child(_button("刷新旅途", session.refresh))

func _collection_page(parent: Node) -> void:
	var column = _column(parent)
	column.add_child(_label("把回忆慢慢收满", 26))
	var collection: Array = session.snapshot.get("collection", [])
	if collection.is_empty():
		column.add_child(_label("第一张明信片，还在路上。\n成功领取旅行物品后，会收藏在这里。", 15, MUTED))
	for item in collection:
		var panel = PanelContainer.new()
		panel.add_theme_stylebox_override("panel", _box(Color("#fffdf8"), 4, Color("#d7ddcf")))
		column.add_child(panel)
		var entry = VBoxContainer.new()
		entry.add_theme_constant_override("separation", 10)
		panel.add_child(entry)
		if ITEM_ART.has(item.itemId):
			entry.add_child(_art(ITEM_ART[item.itemId], 190))
		var label = CATALOG.get(item.itemId, {"name": item.itemId, "detail": "收藏物品"})
		entry.add_child(_label(label.name + "    × " + str(int(item.quantity)), 20))
		entry.add_child(_label(label.detail, 12, MUTED))
		entry.add_child(_label("首次获得  " + item.firstCollectedAt.substr(0, 10), 12, MUTED))

func _return_page(parent: Node) -> void:
	var column = _column(parent)
	column.add_child(_label("它带着回忆回来了", 26))
	for item in last_rewards:
		if ITEM_ART.has(item.itemId):
			column.add_child(_art(ITEM_ART[item.itemId], 160))
		column.add_child(_label(CATALOG.get(item.itemId, {"name": item.itemId}).name + "  × " + str(int(item.quantity)), 20, GREEN))
	column.add_child(_label("带回的小心意，已经收好了。", 13, MUTED))
	column.add_child(_button("翻开收藏", func(): _open("collection"), true))
	column.add_child(_button("回家陪它", func(): _open("home")))

func _settings_page(parent: Node) -> void:
	var column = _column(parent)
	column.add_child(_label("小屋里的习惯", 26))
	var auto_toggle = CheckButton.new()
	auto_toggle.text = "自主散步与生活"
	auto_toggle.button_pressed = automatic
	auto_toggle.toggled.connect(func(value):
		automatic = value
		_save_preferences())
	column.add_child(auto_toggle)
	var reduce_toggle = CheckButton.new()
	reduce_toggle.text = "减少动态效果"
	reduce_toggle.button_pressed = reduced
	reduce_toggle.toggled.connect(func(value):
		reduced = value
		_save_preferences())
	column.add_child(reduce_toggle)
	column.add_child(_label("减少动效时关闭自主活动与环境摆动，保留主动交互。", 12, MUTED))
	column.add_child(_label("账号  " + session.account.username, 18))
	var old_password = LineEdit.new()
	old_password.secret = true
	old_password.placeholder_text = "当前密码"
	old_password.custom_minimum_size.y = 48
	column.add_child(old_password)
	var new_password = LineEdit.new()
	new_password.secret = true
	new_password.placeholder_text = "新密码（至少 15 个字符）"
	new_password.custom_minimum_size.y = 48
	column.add_child(new_password)
	var change = _button("修改密码", func():
		var old = old_password.text
		var fresh = new_password.text
		old_password.clear()
		new_password.clear()
		await session.change_password(old, fresh))
	change.disabled = session.busy
	column.add_child(change)
	var logout = _button("退出登录", session.logout)
	logout.disabled = session.busy
	column.add_child(logout)
	column.add_child(_label("本轮提供三花猫。更多物种与用户资源包导入后续开放。", 12, MUTED))

func _navigation() -> void:
	var row = HBoxContainer.new()
	row.add_theme_constant_override("separation", 4)
	layout.add_child(row)
	for entry in [["home", "家园"], ["bag", "行囊"], ["trip", "旅途"], ["collection", "收藏"]]:
		var button = _button(entry[1], func(): _open(entry[0]))
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.disabled = current_page == entry[0]
		button.flat = true
		button.add_theme_color_override("font_disabled_color", ACCENT)
		row.add_child(button)

func _save_preferences() -> void:
	var prefs = ConfigFile.new()
	prefs.set_value("home", "automatic", automatic)
	prefs.set_value("home", "reduced", reduced)
	prefs.save(settings_file)
	if is_instance_valid(room):
		room.set_options(automatic, reduced)
	if is_instance_valid(home):
		home.set_reduced_motion(reduced)

func _session_view() -> String:
	var value = session.snapshot.duplicate(true)
	value.erase("serverNow")
	return JSON.stringify([value, session.account, session.pending, session.busy, session.online, session.token.is_empty()])

func _session_changed() -> void:
	# Time-only polls must not discard text entry, focus, scroll position or pet activity.
	if _session_view() != rendered_session:
		_queue_draw_page()

func _notice(message: String) -> void:
	await get_tree().process_frame
	if is_instance_valid(toast):
		toast.text = message

func _retry_pending() -> void:
	await session.refresh()
	if not session.token.is_empty() and session.online:
		await session.retry_pending()

func _process(_delta: float) -> void:
	if is_instance_valid(countdown_label):
		var trip = session.snapshot.get("activeTrip")
		if trip != null:
			countdown_label.text = "已经回家，等待领取" if trip.status == "READY_TO_CLAIM" else "还有 %d 秒" % session.seconds_remaining()
			if session.seconds_remaining() == 0 and trip.status == "TRAVELING":
				countdown_label.text = "正在确认归来…"

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		focus_paused = true
		session.set_focused(false)
		if is_instance_valid(room):
			room.process_mode = Node.PROCESS_MODE_DISABLED
		if is_instance_valid(home):
			home.process_mode = Node.PROCESS_MODE_DISABLED
	elif what == NOTIFICATION_APPLICATION_FOCUS_IN:
		focus_paused = false
		session.set_focused(true)
		if is_instance_valid(room):
			room.process_mode = Node.PROCESS_MODE_INHERIT
		if is_instance_valid(home):
			home.process_mode = Node.PROCESS_MODE_INHERIT

func _unhandled_key_input(event: InputEvent) -> void:
	if not is_instance_valid(room) or not event is InputEventKey or not event.pressed:
		return
	var direction = Vector2.ZERO
	match event.keycode:
		KEY_LEFT: direction.x = -1
		KEY_RIGHT: direction.x = 1
		KEY_UP: direction.y = -1
		KEY_DOWN: direction.y = 1
		KEY_SPACE: room.pet.stroke()
	if direction != Vector2.ZERO:
		room.pet.go_to(room.pet.position + direction * 35)
		get_viewport().set_input_as_handled()

func _fatal(message: String) -> void:
	var label = _label("素材配置未能打开\n" + message, 18)
	add_child(label)
	label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
