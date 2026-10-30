class_name GameSession
extends Node

signal changed
signal notice(message: String)
signal reward_received(rewards: Array)

var base_url := "http://127.0.0.1:3100/v1"
var token := ""
var account: Dictionary = {}
var snapshot: Dictionary = {}
var pending: Dictionary = {}
var busy := false
var refreshing := false
var online := false
var generation := 0
var accepted_at := 0
var until_refresh := 0.0
var journal_root := "user://requests"
var focused := true

const MESSAGES = {
	"INVALID_INPUT": "请检查填写内容；密码至少 15 个字符。",
	"INVALID_CREDENTIALS": "用户名或密码不正确。",
	"USERNAME_TAKEN": "用户名已被使用；如果刚才注册超时，请尝试登录。",
	"UNAUTHENTICATED": "登录已过期，请重新登录。",
	"INSUFFICIENT_INVENTORY": "物品数量不足，已重新读取背包。",
	"REVISION_CONFLICT": "存档已经更新，请重新选择行囊。",
	"ACTIVE_TRIP_EXISTS": "已有一段旅行，请先领取归来的物品。",
	"TRIP_NOT_READY": "宠物还在旅途中，稍后再领取。",
	"RATE_LIMITED": "操作较频繁，请稍后重试。",
	"INVALID_LOADOUT": "请选择可用的测试旅行用品。",
	"NETWORK": "暂时无法连接。未确认的操作会保留，请联网后重试。",
	"INVALID_RESPONSE": "服务返回了无法识别的数据，请稍后重试。",
	"STORAGE": "无法保存待确认请求，本次操作没有发送。",
}

func _ready() -> void:
	var configured = OS.get_environment("WANPET_API_BASE_URL").trim_suffix("/")
	if not configured.is_empty():
		base_url = configured
	set_process(true)

func _process(delta: float) -> void:
	if token.is_empty() or not focused:
		return
	until_refresh -= delta
	if until_refresh <= 0 and not busy and not refreshing:
		until_refresh = 5.0 if snapshot.get("activeTrip") != null else 30.0
		refresh()

func set_focused(value: bool) -> void:
	focused = value
	if value:
		until_refresh = 0

func endpoint_allowed() -> bool:
	var match_url = RegEx.create_from_string("^(https?)://([A-Za-z0-9.-]+)(?::([0-9]{1,5}))?/v1$").search(base_url)
	if match_url == null:
		return false
	var port = match_url.get_string(3)
	if not port.is_empty() and (int(port) < 1 or int(port) > 65535):
		return false
	return match_url.get_string(1) == "https" or (OS.is_debug_build() and match_url.get_string(2) in ["127.0.0.1", "localhost"] and not port.is_empty())

func request(path: String, method: HTTPClient.Method = HTTPClient.METHOD_GET, body: Variant = null, key: String = "", authenticated: bool = true) -> Dictionary:
	if not endpoint_allowed():
		return {"status": 0, "code": "NETWORK"}
	var http = HTTPRequest.new()
	http.timeout = 12
	http.max_redirects = 0
	http.body_size_limit = 2 * 1024 * 1024
	add_child(http)
	var headers = PackedStringArray(["Accept: application/json"])
	if body != null:
		headers.append("Content-Type: application/json")
	if authenticated and not token.is_empty():
		headers.append("Authorization: Bearer " + token)
	if not key.is_empty():
		headers.append("Idempotency-Key: " + key)
	var error = http.request(base_url + path, headers, method, "" if body == null else JSON.stringify(body))
	if error != OK:
		http.queue_free()
		return {"status": 0, "code": "NETWORK"}
	var result: Array = await http.request_completed
	http.queue_free()
	if result[0] != HTTPRequest.RESULT_SUCCESS:
		return {"status": 0, "code": "NETWORK"}
	var status = int(result[1])
	if status == 204:
		return {"status": status, "body": {}}
	var parser = JSON.new()
	if parser.parse(result[3].get_string_from_utf8()) != OK or not parser.data is Dictionary:
		return {"status": status, "code": "INVALID_RESPONSE"}
	var payload: Dictionary = parser.data
	if status < 200 or status >= 300:
		return {"status": status, "code": str(payload.get("code", "SERVER_ERROR"))}
	return {"status": status, "body": payload}

func _report(result: Dictionary) -> void:
	var code: String = result.get("code", "SERVER_ERROR")
	notice.emit(MESSAGES.get(code, "服务暂时不可用，请稍后重试。"))

func authenticate(username: String, password: String, registration: bool = false) -> bool:
	if busy:
		return false
	busy = true
	generation += 1
	var epoch = generation
	changed.emit()
	var result = await request("/auth/register" if registration else "/auth/login", HTTPClient.METHOD_POST, {"username": username, "password": password}, "", false)
	if epoch != generation:
		return false
	busy = false
	if result.has("code") or not Wire.auth(result.get("body")):
		if not result.has("code"):
			result.code = "INVALID_RESPONSE"
		_report(result)
		changed.emit()
		return false
	token = result.body.accessToken
	account = result.body.account
	snapshot = {}
	pending = _read_pending()
	online = true
	await refresh(true)
	changed.emit()
	return true

func refresh(initialize: bool = false) -> void:
	if token.is_empty() or refreshing:
		return
	refreshing = true
	var epoch = generation
	var result = await request("/me/snapshot")
	if epoch != generation:
		return
	refreshing = false
	if result.get("code") == "PLAYER_NOT_INITIALIZED" and initialize:
		if pending.is_empty():
			_prepare("initialize", "/me/initialize", {})
		if pending.get("operation") == "initialize":
			await retry_pending()
		return
	if result.has("code"):
		online = false
		if result.status == 401:
			_expire()
		_report(result)
	elif not Wire.snapshot(result.get("body")):
		online = false
		_report({"code": "INVALID_RESPONSE"})
	else:
		online = true
		_accept(result.body)
	until_refresh = 5.0 if snapshot.get("activeTrip") != null else 30.0
	changed.emit()

func _accept(value: Dictionary) -> bool:
	if not Wire.accepts(snapshot, value):
		return false
	snapshot = value.duplicate(true)
	accepted_at = Time.get_ticks_msec()
	return true

func seconds_remaining() -> int:
	var trip = snapshot.get("activeTrip")
	if trip == null:
		return 0
	var elapsed = maxf(0, (Time.get_ticks_msec() - accepted_at) / 1000.0)
	return maxi(0, ceili(Wire.epoch(trip.returnAt) - Wire.epoch(snapshot.serverNow) - elapsed))

func start_trip(item_ids: Array) -> void:
	if busy or not online or snapshot.is_empty() or snapshot.activeTrip != null:
		return
	if not pending.is_empty():
		notice.emit("还有一个待确认操作，请先重试。")
		return
	var ids = item_ids.duplicate()
	ids.sort()
	if _prepare("start", "/me/trips", {"loadoutItemIds": ids, "expectedRevision": snapshot.revision}):
		await retry_pending()

func claim_trip() -> void:
	if busy or not online or snapshot.get("activeTrip") == null:
		return
	if not pending.is_empty():
		notice.emit("还有一个待确认操作，请先重试。")
		return
	if _prepare("claim", "/me/trips/" + snapshot.activeTrip.id + "/claim", {}):
		await retry_pending()

func _journal_path() -> String:
	return journal_root + "/" + (base_url + ":" + str(account.get("id", ""))).sha256_text() + ".json"

func _read_pending() -> Dictionary:
	var file = _journal_path()
	if not FileAccess.file_exists(file):
		return {}
	var value = JSON.parse_string(FileAccess.get_file_as_string(file))
	if value is Dictionary and value.get("accountId") == account.get("id") and value.get("operation") in ["initialize", "start", "claim"] and Wire.text(value.get("key"), 128) and value.get("body") is Dictionary:
		var path: String = value.get("path", "")
		var valid_path = path == "/me/initialize" if value.operation == "initialize" else path == "/me/trips" if value.operation == "start" else RegEx.create_from_string("^/me/trips/[a-f0-9-]{36}/claim$").search(path) != null
		if valid_path:
			return value
	notice.emit("待确认请求文件损坏，已停止写操作；请保留文件以便检查。")
	return {"operation": "invalid"}

func _prepare(operation: String, path: String, body: Dictionary) -> bool:
	var record = {"operation": operation, "path": path, "body": body, "key": Crypto.new().generate_random_bytes(24).hex_encode(), "accountId": account.id}
	if DirAccess.make_dir_recursive_absolute(journal_root) != OK:
		_report({"code": "STORAGE"})
		return false
	var file = FileAccess.open(_journal_path() + ".tmp", FileAccess.WRITE)
	if file == null:
		_report({"code": "STORAGE"})
		return false
	file.store_string(JSON.stringify(record))
	file.flush()
	var error = file.get_error()
	file.close()
	if error != OK or DirAccess.rename_absolute(_journal_path() + ".tmp", _journal_path()) != OK:
		_report({"code": "STORAGE"})
		return false
	pending = record
	return true

func retry_pending() -> void:
	if busy or pending.is_empty() or pending.get("operation") == "invalid" or token.is_empty():
		return
	busy = true
	var epoch = generation
	var record = pending.duplicate(true)
	changed.emit()
	var result = await request(record.path, HTTPClient.METHOD_POST, record.body, record.key)
	if epoch != generation:
		return
	busy = false
	if not result.has("code"):
		var body: Dictionary = result.get("body", {})
		var candidate = body if record.operation == "initialize" else body.get("snapshot")
		var valid = Wire.snapshot(candidate)
		if record.operation == "start":
			valid = valid and Wire.trip(body.get("trip"))
		if record.operation == "claim":
			valid = valid and Wire.text(body.get("tripId")) and Wire.text(body.get("ledgerEntryId")) and Wire.lines(body.get("rewards"))
		if not valid:
			result.code = "INVALID_RESPONSE"
		else:
			_accept(candidate)
			if record.operation == "claim":
				reward_received.emit(body.rewards)
			_clear_pending()
	if result.has("code"):
		_report(result)
		if result.status == 401:
			_expire()
		elif result.status >= 400 and result.status < 500 and result.status != 429 and result.code != "INVALID_RESPONSE":
			# These definite rejections did not commit a write. Unknown outcomes keep the same key.
			_clear_pending()
		online = result.status > 0 and not token.is_empty()
	if not token.is_empty():
		await refresh()
	changed.emit()

func _clear_pending() -> void:
	DirAccess.remove_absolute(_journal_path())
	pending = {}

func logout() -> void:
	if busy:
		return
	busy = true
	var result = await request("/auth/logout", HTTPClient.METHOD_POST, {})
	busy = false
	if result.has("code") and result.status != 401:
		_report(result)
		return
	_expire()

func change_password(old_password: String, new_password: String) -> void:
	if busy:
		return
	busy = true
	changed.emit()
	var result = await request("/auth/password", HTTPClient.METHOD_PUT, {"currentPassword": old_password, "newPassword": new_password})
	busy = false
	if result.has("code"):
		_report(result)
		if result.status == 401:
			_expire()
	else:
		_expire()
		notice.emit("密码已修改，请重新登录。")
	changed.emit()

func _expire() -> void:
	generation += 1
	token = ""
	account = {}
	snapshot = {}
	pending = {}
	busy = false
	refreshing = false
	online = false
	changed.emit()
