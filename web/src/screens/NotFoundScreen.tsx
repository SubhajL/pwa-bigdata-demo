import { Link } from "react-router-dom";
import { FileQuestion } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Catch-all route.
 *
 * Follows the INTERACTIONS.md error formula — what happened · why · how to fix — in Thai,
 * with a link back into the app. Never a bare "404".
 */
export function NotFoundScreen(): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Card className="max-w-md text-center">
        <CardHeader>
          <FileQuestion className="mx-auto h-12 w-12 text-on-surface-variant" aria-hidden="true" />
          <CardTitle>ไม่พบหน้าที่คุณค้นหา</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-on-surface-variant">
            URL ที่คุณป้อนไม่มีอยู่ในระบบ · กรุณาตรวจสอบที่อยู่หรือกลับไปยังหน้าแรก
          </p>
          <Button asChild>
            <Link to="/">กลับสู่หน้าหลัก</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
