import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

import org.apache.jena.query.ARQ;
import org.apache.jena.query.Dataset;
import org.apache.jena.query.Query;
import org.apache.jena.query.QueryExecution;
import org.apache.jena.query.QueryExecutionFactory;
import org.apache.jena.query.QueryFactory;
import org.apache.jena.query.ReadWrite;
import org.apache.jena.query.ResultSet;
import org.apache.jena.query.ResultSetFormatter;
import org.apache.jena.sparql.resultset.ResultsFormat;
import org.apache.jena.tdb2.TDB2Factory;
import org.eclipse.jetty.compression.server.CompressionConfig;
import org.eclipse.jetty.compression.server.CompressionHandler;
import org.eclipse.jetty.ee10.servlet.ServletContextHandler;
import org.eclipse.jetty.ee10.servlet.ServletHolder;
import org.eclipse.jetty.http2.server.HTTP2CServerConnectionFactory;
import org.eclipse.jetty.server.HttpConfiguration;
import org.eclipse.jetty.server.HttpConnectionFactory;
import org.eclipse.jetty.server.Server;
import org.eclipse.jetty.server.ServerConnector;

import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

public class SparqlServer {
    public static void main(String[] args) throws Exception {
        ARQ.init();
        ARQ.getContext().set(ARQ.optimization, true);
        ARQ.getContext().set(ARQ.optFilterPlacement, true);
        Dataset dataset = TDB2Factory.connectDataset("./tdb2_data");

        Server server = new Server();

        HttpConfiguration httpConfig = new HttpConfiguration();
        HttpConnectionFactory http11 = new HttpConnectionFactory(httpConfig);
        HTTP2CServerConnectionFactory http2c = new HTTP2CServerConnectionFactory(httpConfig);

        ServerConnector connector = new ServerConnector(server, http11, http2c);
        String portStr = System.getenv("PORT");
        int port = (portStr != null) ? Integer.parseInt(portStr) : 3000;
        connector.setPort(port);
        server.addConnector(connector);

        ServletContextHandler context = new ServletContextHandler(ServletContextHandler.SESSIONS);
        context.setContextPath("/");
        server.setHandler(context);

        CompressionHandler compressionHandler = new CompressionHandler();
        compressionHandler.setHandler(context);

        CompressionConfig config = CompressionConfig.builder()
                .compressIncludeMethod("POST")
                .compressIncludeMimeType("application/sparql-results+json")
                .compressIncludeMimeType("application/sparql-results+xml")
                .compressIncludeMimeType("text/csv")
                .compressIncludeMimeType("text/tab-separated-values")
                .build();

        compressionHandler.putConfiguration("/*", config);

        server.setHandler(compressionHandler);

        context.addServlet(new ServletHolder(new HttpServlet() {
            @Override
            protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
                try {
                    String queryStr = req.getParameter("query");
                    if (queryStr == null) {
                        queryStr = req.getReader().lines().reduce("", (accumulator, actual) -> accumulator + actual);
                    }

                    String acceptHeader = req.getHeader("Accept");
                    if (acceptHeader == null)
                        acceptHeader = "application/sparql-results+json";
                    else
                        acceptHeader = acceptHeader.split(",")[0].trim();

                    String generatedEtag = getEtagForQuery(acceptHeader, queryStr);
                    resp.setHeader("access-control-allow-origin", "*");
                    resp.setHeader("etag", generatedEtag);
                    resp.setHeader("cache-control", "public, max-age=0, s-maxage=0, must-revalidate");

                    String ifNoneMatch = req.getHeader("if-none-match");
                    if (ifNoneMatch != null && ifNoneMatch.split("--")[0].equals(generatedEtag)) {
                        resp.setStatus(HttpServletResponse.SC_NOT_MODIFIED);
                        return;
                    }

                    resp.setContentType(acceptHeader);
                    resp.setStatus(HttpServletResponse.SC_OK);

                    Query query = QueryFactory.create(queryStr);

                    try (OutputStream os = resp.getOutputStream()) {
                        dataset.begin(ReadWrite.READ);
                        try (QueryExecution qexec = QueryExecutionFactory.create(query, dataset)) {
                            if (query.isSelectType()) {
                                ResultSet results = qexec.execSelect();
                                ResultsFormat fmt = ResultsFormat.lookup(acceptHeader);
                                if (fmt == null)
                                    fmt = ResultsFormat.JSON;
                                ResultSetFormatter.output(os, results, fmt);
                            }
                            os.flush();
                        } finally {
                            dataset.end();
                        }
                    }
                } catch (Throwable e) {
                    e.printStackTrace();
                    resp.sendError(HttpServletResponse.SC_BAD_REQUEST, e.getMessage());
                }
            }

            @Override
            protected void doOptions(HttpServletRequest req, HttpServletResponse resp) throws IOException {
                resp.setHeader("access-control-allow-origin", "*");
                resp.setHeader("access-control-allow-methods", "POST, OPTIONS");
                resp.setHeader("access-control-allow-headers", "content-type, accept, if-none-match");
                resp.setStatus(HttpServletResponse.SC_OK);
            }
        }), "/*");

        System.out.println("Jetty SPARQL server running on port " + port + " with HTTP/2 support");
        server.start();
        server.join();
    }

    private static String getEtagForQuery(String acceptHeader, String queryStr) {
        String dataVersion = System.getenv("DATA_VERSION");
        if (dataVersion == null)
            dataVersion = "dev";

        String etagInput = dataVersion + "_" + queryStr.trim() + "_" + acceptHeader;
        String generatedEtag = "";

        try {
            java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(etagInput.getBytes(StandardCharsets.UTF_8));
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1)
                    hexString.append('0');
                hexString.append(hex);
            }
            generatedEtag = "\"" + hexString.toString() + "\"";
        } catch (Exception e) {
            generatedEtag = "\"" + String.valueOf(etagInput.hashCode()) + "\"";
        }
        return generatedEtag;
    }
}
