//+------------------------------------------------------------------+
//|  EDGE_Journal.mq5                                                |
//|  Auto-logs Exness MT5 trades to the EDGE Trading Journal         |
//|  via Google Apps Script → Google Sheets                          |
//|                                                                  |
//|  SETUP:                                                          |
//|  1. MT5 → Tools → Options → Expert Advisors                     |
//|     ✓ Allow WebRequest for listed URL                            |
//|     → Add your Apps Script URL                                   |
//|  2. Compile this file in MetaEditor (F7)                         |
//|  3. Attach to any chart (e.g. XAUUSD M15)                       |
//|  4. Set AppsScriptURL input to your deployed web app URL         |
//+------------------------------------------------------------------+
#property copyright   "EDGE Trading Journal"
#property link        "https://github.com/XLR8MDA/TradingJournal"
#property version     "1.00"
#property description "Logs trade events to EDGE Journal via Apps Script"

//--- Input parameters
input string AppsScriptURL = "";         // Apps Script web app URL (required)
input string AccountLabel  = "Exness";   // Label shown in journal (e.g. "Exness Demo")
input bool   LogOpens      = true;       // Log trade opens
input bool   LogCloses     = true;       // Log trade closes
input int    RequestTimeout = 8000;      // HTTP timeout in milliseconds

//+------------------------------------------------------------------+
//| Initialisation                                                   |
//+------------------------------------------------------------------+
int OnInit() {
   if (AppsScriptURL == "") {
      Alert("EDGE Journal: No Apps Script URL configured. EA is inactive.");
      Print("EDGE Journal: Set AppsScriptURL in EA inputs to activate.");
      return INIT_PARAMETERS_INCORRECT;
   }
   Print("EDGE Journal v1.00 — Ready. Account label: ", AccountLabel);
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Trade transaction handler — fires on every deal                  |
//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest     &request,
                        const MqlTradeResult      &result) {

   // Only handle filled deals
   if (trans.type != TRADE_TRANSACTION_DEAL_ADD) return;

   long dealTicket = trans.deal;

   // Load the deal into history
   if (!HistorySelect(0, TimeCurrent() + 60)) return;
   if (!HistoryDealSelect(dealTicket))        return;

   long   dealType = HistoryDealGetInteger(dealTicket, DEAL_TYPE);
   long   entry    = HistoryDealGetInteger(dealTicket, DEAL_ENTRY);

   // Only process Buy / Sell deals (skip balance/credit entries)
   if (dealType != DEAL_TYPE_BUY && dealType != DEAL_TYPE_SELL) return;

   string eventType = (entry == DEAL_ENTRY_IN)  ? "OPEN"  :
                      (entry == DEAL_ENTRY_OUT) ? "CLOSE" : "MODIFY";

   if (eventType == "OPEN"  && !LogOpens)  return;
   if (eventType == "CLOSE" && !LogCloses) return;

   string symbol    = HistoryDealGetString(dealTicket,  DEAL_SYMBOL);
   double price     = HistoryDealGetDouble(dealTicket,  DEAL_PRICE);
   double volume    = HistoryDealGetDouble(dealTicket,  DEAL_VOLUME);
   double profit    = HistoryDealGetDouble(dealTicket,  DEAL_PROFIT);
   double swap      = HistoryDealGetDouble(dealTicket,  DEAL_SWAP);
   double commission= HistoryDealGetDouble(dealTicket,  DEAL_COMMISSION);
   long   posId     = HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);
   string comment   = HistoryDealGetString(dealTicket,  DEAL_COMMENT);

   string direction = (dealType == DEAL_TYPE_BUY) ? "Long" : "Short";

   // Fetch SL / TP from the open position (available on OPEN events)
   double sl = 0.0, tp = 0.0;
   if (eventType == "OPEN" && PositionSelectByTicket(posId)) {
      sl = PositionGetDouble(POSITION_SL);
      tp = PositionGetDouble(POSITION_TP);
   }

   string dateStr = TimeToString(TimeCurrent(), TIME_DATE);          // YYYY.MM.DD
   string isoDate = StringSubstr(dateStr, 0, 4) + "-" +             // YYYY-MM-DD
                    StringSubstr(dateStr, 5, 2) + "-" +
                    StringSubstr(dateStr, 8, 2);

   string payload = BuildPayload_(
      dealTicket, symbol, direction, price, sl, tp,
      volume, profit, swap, commission, posId, comment, eventType, isoDate
   );

   SendToJournal_(payload, eventType, symbol);
}

//+------------------------------------------------------------------+
//| Build JSON payload matching Code.gs logTrade_ schema             |
//+------------------------------------------------------------------+
string BuildPayload_(long   ticket,    string symbol,    string direction,
                     double entryPrice, double sl,       double tp,
                     double volume,    double profit,    double swap,
                     double commission, long  posId,     string comment,
                     string eventType,  string isoDate) {

   // Determine decimal places for this symbol
   int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);

   string json = "{";
   json += "\"action\":\"logTrade\",";
   json += "\"trade\":{";
   json += "\"id\":"        + IntegerToString(ticket)                 + ",";
   json += "\"date\":\""    + EscapeJson_(isoDate)                    + "\",";
   json += "\"mode\":\"live\","                                           ;
   json += "\"pair\":\""    + EscapeJson_(symbol)                     + "\",";
   json += "\"direction\":\"" + EscapeJson_(direction)                + "\",";
   json += "\"entry\":"     + DoubleToString(entryPrice, digits)      + ",";
   json += "\"sl\":"        + DoubleToString(sl,         digits)      + ",";
   json += "\"tp\":"        + DoubleToString(tp,         digits)      + ",";
   json += "\"volume\":"    + DoubleToString(volume,     2)           + ",";
   json += "\"profit\":"    + DoubleToString(profit,     2)           + ",";
   json += "\"swap\":"      + DoubleToString(swap,       2)           + ",";
   json += "\"commission\":" + DoubleToString(commission, 2)          + ",";
   json += "\"positionId\":" + IntegerToString(posId)                 + ",";
   json += "\"eventType\":\"" + EscapeJson_(eventType)                + "\",";
   json += "\"accountLabel\":\"" + EscapeJson_(AccountLabel)          + "\",";
   json += "\"notes\":\""   + EscapeJson_(comment)                    + "\",";
   json += "\"createdAt\":\"" + EscapeJson_(TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS)) + "\"";
   json += "}}";
   return json;
}

//+------------------------------------------------------------------+
//| Send payload via HTTP POST                                       |
//+------------------------------------------------------------------+
void SendToJournal_(string payload, string eventType, string symbol) {
   char   postData[];
   char   responseData[];
   string responseHeaders;
   string contentType = "Content-Type: application/json\r\n";

   int len = StringLen(payload);
   ArrayResize(postData, len);
   StringToCharArray(payload, postData, 0, len);  // no null terminator

   int httpCode = WebRequest(
      "POST",
      AppsScriptURL,
      contentType,
      RequestTimeout,
      postData,
      responseData,
      responseHeaders
   );

   if (httpCode == -1) {
      int err = GetLastError();
      Print("EDGE Journal: WebRequest error ", err,
            ". Check URL is whitelisted in MT5 Options → Expert Advisors.");
      if (err == 4060) {
         Print("EDGE Journal: Error 4060 — URL not in allowed list. Add it in MT5 Options.");
      }
      return;
   }

   if (httpCode == 200 || httpCode == 302) {
      string response = CharArrayToString(responseData, 0, WHOLE_ARRAY, CP_UTF8);
      Print("EDGE Journal: ", eventType, " logged — ", symbol,
            " | HTTP ", httpCode,
            " | Response: ", StringSubstr(response, 0, 120));
   } else {
      string response = CharArrayToString(responseData, 0, WHOLE_ARRAY, CP_UTF8);
      Print("EDGE Journal: Unexpected HTTP ", httpCode,
            " | ", StringSubstr(response, 0, 200));
   }
}

//+------------------------------------------------------------------+
//| Escape special characters for JSON strings                       |
//+------------------------------------------------------------------+
string EscapeJson_(string s) {
   StringReplace(s, "\\", "\\\\");
   StringReplace(s, "\"", "\\\"");
   StringReplace(s, "\n", "\\n");
   StringReplace(s, "\r", "\\r");
   StringReplace(s, "\t", "\\t");
   return s;
}

//+------------------------------------------------------------------+
//| Deactivation                                                     |
//+------------------------------------------------------------------+
void OnDeinit(const int reason) {
   Print("EDGE Journal: EA removed. Reason code: ", reason);
}
