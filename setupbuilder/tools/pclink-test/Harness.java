import de.setupbuilder.app.PcLinkServer;
import java.nio.file.*;
public class Harness {
  public static void main(String[] a) throws Exception {
    String script = new String(Files.readAllBytes(Paths.get(a[0])), "UTF-8");
    PcLinkServer s = new PcLinkServer(script, new PcLinkServer.Listener() {
      public void onScriptFetched() { System.out.println("EVENT script-fetched"); }
      public void onScan(String json) { try { Files.write(Paths.get("scan.json"), json.getBytes("UTF-8")); } catch (Exception e) {} System.out.println("EVENT scan " + json.length() + " Zeichen"); }
    });
    String ip = PcLinkServer.findLanAddress();
    s.start(ip == null ? "127.0.0.1" : ip);
    System.out.println("CMD irm http://" + s.getIp() + ":" + s.getPort() + "/" + s.getToken() + " | iex");
    Thread.sleep(Long.parseLong(a[1]));
    s.stop();
  }
}
