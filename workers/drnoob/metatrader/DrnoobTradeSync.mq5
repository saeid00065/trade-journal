#property strict
#property version   "1.0"

input string Endpoint = "https://drnoob.saeid00065.workers.dev/v1/trades";
input string ApiToken = "";
input int PollSeconds = 60;
input int InitialHistoryDays = 7;

datetime lastSync;

string quote(const string value) {
  string escaped = value;
  StringReplace(escaped, "\\", "\\\\");
  StringReplace(escaped, "\"", "\\\"");
  return "\"" + escaped + "\"";
}

bool sendDeal(const ulong ticket) {
  const long type = HistoryDealGetInteger(ticket, DEAL_TYPE);
  const long entry = HistoryDealGetInteger(ticket, DEAL_ENTRY);
  if ((type != DEAL_TYPE_BUY && type != DEAL_TYPE_SELL) ||
      (entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY)) return true;

  const string account = IntegerToString((long)AccountInfoInteger(ACCOUNT_LOGIN));
  const string side = type == DEAL_TYPE_BUY ? "buy" : "sell";
  const datetime dealTime = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
  const string body = "{"
    "\"accountId\":" + quote(account) + ","
    "\"ticket\":" + quote(IntegerToString((long)ticket)) + ","
    "\"symbol\":" + quote(HistoryDealGetString(ticket, DEAL_SYMBOL)) + ","
    "\"side\":" + quote(side) + ","
    "\"volume\":" + DoubleToString(HistoryDealGetDouble(ticket, DEAL_VOLUME), 2) + ","
    "\"closeTime\":" + quote(TimeToString(dealTime, TIME_DATE | TIME_SECONDS)) + ","
    "\"closePrice\":" + DoubleToString(HistoryDealGetDouble(ticket, DEAL_PRICE), _Digits) + ","
    "\"profit\":" + DoubleToString(HistoryDealGetDouble(ticket, DEAL_PROFIT), 2) + ","
    "\"commission\":" + DoubleToString(HistoryDealGetDouble(ticket, DEAL_COMMISSION), 2) + ","
    "\"swap\":" + DoubleToString(HistoryDealGetDouble(ticket, DEAL_SWAP), 2)
    + "}";

  char data[];
  char result[];
  string responseHeaders;
  StringToCharArray(body, data, 0, WHOLE_ARRAY, CP_UTF8);
  ArrayResize(data, ArraySize(data) - 1);
  const string headers = "Content-Type: application/json\r\nAuthorization: Bearer " + ApiToken + "\r\n";
  const int status = WebRequest("POST", Endpoint, headers, 10000, data, result, responseHeaders);
  if (status < 200 || status >= 300) {
    PrintFormat("drnoob sync failed for deal %I64u: HTTP %d, error %d", ticket, status, GetLastError());
    return false;
  }
  return true;
}

void syncClosedDeals() {
  const datetime now = TimeCurrent();
  if (!HistorySelect(lastSync, now)) {
    PrintFormat("drnoob could not select account history: %d", GetLastError());
    return;
  }
  const int count = HistoryDealsTotal();
  for (int i = 0; i < count; i++) sendDeal(HistoryDealGetTicket(i));
  lastSync = now;
}

int OnInit() {
  if (ApiToken == "") {
    Print("Set the ApiToken input before starting drnoob sync.");
    return INIT_PARAMETERS_INCORRECT;
  }
  lastSync = TimeCurrent() - InitialHistoryDays * 86400;
  EventSetTimer(PollSeconds);
  syncClosedDeals();
  return INIT_SUCCEEDED;
}

void OnTimer() { syncClosedDeals(); }
void OnDeinit(const int reason) { EventKillTimer(); }
