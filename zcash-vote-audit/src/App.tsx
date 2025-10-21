import { SubmitHandler, useForm } from "react-hook-form";
import { invoke } from "@tauri-apps/api/core";
import { EChart } from "@kbox-labs/react-echarts";
import { useState } from "react";
import Swal from "sweetalert2";
import { Spinner } from "./Spinner";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "./components/ui/card";
import { Form, FormField, FormItem, FormLabel } from "./components/ui/form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "./components/ui/input";
import { Button } from "./components/ui/button";

const auditSchema = z.object({
  url: z.string(),
  seed: z.string(),
});

type Count = {
  choice: string;
  amount: number;
};

function App() {
  const [validating, setValidating] = useState(false);
  const [results, setResults] = useState<Count[]>([]);
  const form = useForm<z.infer<typeof auditSchema>>({
    resolver: zodResolver(auditSchema),
    defaultValues: {
      url: "",
      seed: "",
    },
  });
  const { control, handleSubmit } = form;

  const onSubmit: SubmitHandler<z.infer<typeof auditSchema>> = (params) => {
    console.log(params);

    (async () => {
      try {
        setValidating(true);
        const res: Count[] = await invoke("audit", params);
        console.log(res);
        setResults(res);
      } catch (e: any) {
        await Swal.fire({
          icon: "error",
          title: e,
        });
      } finally {
        setValidating(false);
      }
    })();
  };

  const labels = results.map((c) => c.choice);
  const votes = results.map((c) => c.amount / 100000);

  return (
    <main>
      {validating && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Spinner />
        </div>
      )}

      {results.length == 0 && (
        <Form {...form}>
          <form
            className="flex justify-center items-center bg-gray-100"
            onSubmit={handleSubmit(onSubmit)}
          >
            <Card className="w-full max-w-md">
              <CardHeader>Election Audit</CardHeader>
              <CardContent>
                <FormField
                  name="url"
                  control={control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Election URL</FormLabel>
                      <Input {...field} />
                    </FormItem>
                  )}
                />
                <FormField
                  name="seed"
                  control={control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Seed Phrase</FormLabel>
                      <Input {...field} />
                    </FormItem>
                  )}
                />
              </CardContent>
              <CardFooter>
                <Button type="submit">Verify Ballots and Show Results</Button>
              </CardFooter>
            </Card>
          </form>
        </Form>
      )}
      <EChart
        renderer={"svg"}
        onClick={() => console.log("clicked!")}
        style={{
          height: "600px",
          width: "100%",
        }}
        xAxis={{
          type: "category",
          data: labels,
        }}
        yAxis={{
          type: "value",
        }}
        series={[
          {
            data: votes,
            type: "bar",
            showBackground: true,
            backgroundStyle: {
              color: "rgba(180, 180, 180, 0.2)",
            },
            label: {
              show: true,
              position: "inside",
            },
          },
        ]}
      />
    </main>
  );
}

export default App;
