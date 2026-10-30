class_name Wire
extends RefCounted

static func text(value: Variant, maximum: int = 256) -> bool:
	return value is String and not value.is_empty() and value.length() <= maximum

static func integer(value: Variant, minimum: int = 0) -> bool:
	return (value is int or value is float) and is_finite(value) and value == floor(value) and value >= minimum and value <= 2147483647

static func timestamp(value: Variant) -> bool:
	if not value is String:
		return false
	var regex = RegEx.create_from_string("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{3})?Z$")
	return regex.search(value) != null and Time.get_unix_time_from_datetime_string(value) > 0

static func lines(value: Variant, collection: bool = false) -> bool:
	if not value is Array or value.size() > 10000:
		return false
	var ids: Array = []
	for item in value:
		if not item is Dictionary or not text(item.get("itemId")) or not integer(item.get("quantity")) or item.itemId in ids:
			return false
		if collection and not timestamp(item.get("firstCollectedAt")):
			return false
		ids.append(item.itemId)
	return true

static func trip(value: Variant) -> bool:
	return value is Dictionary and text(value.get("id")) and value.get("status") in ["TRAVELING", "READY_TO_CLAIM", "CLAIMED"] and timestamp(value.get("startedAt")) and timestamp(value.get("returnAt")) and text(value.get("configVersion")) and text(value.get("destinationId"))

static func snapshot(value: Variant) -> bool:
	if not value is Dictionary or not value.get("player") is Dictionary or not value.get("pet") is Dictionary:
		return false
	return text(value.player.get("id")) and text(value.player.get("username")) and text(value.pet.get("id")) and text(value.pet.get("speciesId")) and text(value.pet.get("nickname")) and value.pet.get("status") in ["AT_HOME", "TRAVELING"] and integer(value.get("revision"), 1) and timestamp(value.get("serverNow")) and text(value.get("configVersion")) and lines(value.get("inventory")) and lines(value.get("collection", []), true) and value.has("activeTrip") and (value.activeTrip == null or trip(value.activeTrip))

static func auth(value: Variant) -> bool:
	if not value is Dictionary or not value.get("account") is Dictionary:
		return false
	if not text(value.get("accessToken"), 43):
		return false
	var regex = RegEx.create_from_string("^[A-Za-z0-9_-]{43}$")
	return regex.search(value.accessToken) != null and text(value.account.get("id")) and text(value.account.get("username")) and timestamp(value.get("expiresAt"))

static func accepts(current: Dictionary, candidate: Dictionary) -> bool:
	if not snapshot(candidate):
		return false
	if current.is_empty():
		return true
	if current.player.id != candidate.player.id:
		return false
	if candidate.revision < current.revision:
		return false
	return candidate.revision > current.revision or candidate.serverNow >= current.serverNow

static func epoch(iso: String) -> float:
	# ISO timestamps are UTC; wall-clock time on the device is never consulted.
	return Time.get_unix_time_from_datetime_string(iso)
